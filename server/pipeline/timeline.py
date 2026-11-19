"""Draft and validate a timeline from an ingested video. No implicit live client."""

from __future__ import annotations

import asyncio
import json
import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Callable, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from mock_pipeline import check_budget
from pipeline.ingest import IngestedVideo

MODEL = "gemini-4-hydrogen"
# Campus 4-video × 1/2/4 fps experiment (.context/ai3-fps-experiment.log):
# 2 fps is the lowest rate with zero corrections on all four videos.
DEFAULT_FPS = 2
CALL_TIMEOUT_SECONDS = 180
MAX_OVERLAP_SECONDS = 0.5
MAX_END_OVERRUN_SECONDS = 1.0
TIMELINE_PROMPT = """Watch this continuous entrance-to-room walk and return JSON matching the schema.
Use startFloor for the floor visible at the start ("unknown" if unreadable), and
endRoom for the room number readable at the end, or null if unreadable.
First write motionLog: one entry for each successive two-second interval starting
at 0 seconds, including a final partial interval. Use forward, rotating_left,
rotating_right, still, or on_stairs. Write this before deciding the events.
Then write timed, ordered, non-overlapping events in seconds, with positive
length, confidence from 0 to 1, and a short landmark note (empty if none).
Left and right are from the walker's point of view. In a left turn the scene
slides to the right across the frame.
A turn is about 90 degrees, and the walker continues in the new direction.
A U-turn is about 180 degrees; the usual case is the landing between two flights
of stairs. Use u_turn_left or u_turn_right for its side.
A pan is standing still and looking around. It is NOT a turn.
The last turn through the room's doorway is turn_into_room.
Report a sign's text only if it is readable. Do not guess signs, floors or rooms.
"""

EventType = Literal[
    "walk", "turn_left", "turn_right", "u_turn_left", "u_turn_right",
    "turn_into_room", "stairs_up", "stairs_down", "door", "sign", "pan",
]
Motion = Literal["forward", "rotating_left", "rotating_right", "still", "on_stairs"]


class TimelineEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

    type: EventType
    startSec: float = Field(ge=0)
    endSec: float = Field(gt=0)
    confidence: float = Field(ge=0, le=1)
    note: str


class Timeline(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    startFloor: str
    endRoom: str | None
    # Field order also determines the schema order sent to Gemini.
    motionLog: list[Motion] = Field(min_length=1)
    events: list[TimelineEvent]


TIMELINE_SCHEMA = Timeline.model_json_schema()


class TimelineError(RuntimeError):
    """Safe, readable failure text for a future failed route."""


class TimelineValidationError(TimelineError):
    pass


class TimelineServiceError(TimelineError):
    def __init__(self, status_code: int | None = None):
        self.status_code = status_code
        suffix = f" (HTTP {status_code})" if status_code is not None else ""
        super().__init__(f"Gemini request failed{suffix}.")


class TimelineClient(Protocol):
    async def generate(
        self, video: IngestedVideo, *, fps: float, prompt: str, schema: dict,
    ) -> str:
        """Upload, await readiness, and return only the model's JSON text."""
        ...


@dataclass(frozen=True)
class TimelineResult:
    timeline: Timeline
    raw_answer: str
    cost_usd: Decimal
    cached: bool
    warnings: tuple[str, ...] = ()


def validation_warnings(timeline: Timeline, duration_seconds: float) -> tuple[str, ...]:
    """Motion-log density is advisory; retain every valid label as returned."""
    expected = math.ceil(duration_seconds / 2)
    actual = len(timeline.motionLog)
    if actual != expected:
        return (
            f"Motion log has {actual} {'entry' if actual == 1 else 'entries'}; expected {expected} for "
            f"{duration_seconds:g} seconds. Kept as returned.",
        )
    return ()


def parse_timeline(answer: str, duration_seconds: float) -> Timeline:
    """Validate before normalizing small overlaps and filling all uncovered time."""
    if not math.isfinite(duration_seconds) or duration_seconds <= 0:
        raise TimelineValidationError("Video duration must be positive and finite.")
    try:
        timeline = Timeline.model_validate_json(answer)
    except ValidationError:
        # Never echo provider output (or its exception) into logs or route errors.
        raise TimelineValidationError("Gemini answer does not match the timeline schema.") from None
    normalized: list[TimelineEvent] = []
    previous_start = -1.0
    cursor = 0.0
    for event in timeline.events:
        if event.startSec < previous_start:
            raise TimelineValidationError("Timeline events are out of order.")
        previous_start = event.startSec
        if event.endSec <= event.startSec:
            raise TimelineValidationError("Timeline events must have positive length.")
        if (event.endSec > duration_seconds + MAX_END_OVERRUN_SECONDS
                or event.startSec >= duration_seconds):
            raise TimelineValidationError("Timeline event is outside the video duration.")
        if event.endSec > duration_seconds:
            event = event.model_copy(update={"endSec": duration_seconds})
        if event.startSec < cursor:
            if cursor - event.startSec > MAX_OVERLAP_SECONDS or event.endSec <= cursor:
                raise TimelineValidationError("Timeline events have an unresolvable overlap.")
            event = event.model_copy(update={"startSec": cursor})
        if event.startSec > cursor:
            normalized.append(_gap(cursor, event.startSec))
        normalized.append(event)
        cursor = event.endSec
    if cursor < duration_seconds:
        normalized.append(_gap(cursor, duration_seconds))
    return timeline.model_copy(update={"events": normalized})


def _gap(start: float, end: float) -> TimelineEvent:
    return TimelineEvent(
        type="walk", startSec=start, endSec=end, confidence=0,
        note="Gap filled as walk; review.",
    )


def estimated_cost(duration_seconds: float, fps: float) -> Decimal:
    # Estimate only: the documented ~$0.06 / 86 seconds at 1 fps, not a billing receipt.
    return Decimal("0.06") * Decimal(str(duration_seconds)) * Decimal(str(fps)) / Decimal(86)


def fps_label(fps: float) -> str:
    # Normalize 1 and 1.0 without rounding distinct sampling rates into one cache.
    return repr(float(fps)).removesuffix(".0")


def total_spend(data_dir: Path) -> Decimal:
    try:
        with (data_dir / "spend.jsonl").open(encoding="utf-8") as ledger:
            return sum(
                (Decimal(str(json.loads(line, parse_float=Decimal)["costUsd"]))
                 for line in ledger if line.strip()), Decimal(0),
            )
    except FileNotFoundError:
        return Decimal(0)


def load_cached_timeline(
    video: IngestedVideo, *, data_dir: Path, fps: float = DEFAULT_FPS,
) -> TimelineResult | None:
    """Read a validated cache without a client, budget check, or side effects."""
    if not isinstance(video, IngestedVideo):
        raise TypeError("Timeline input must come from ingest_video.")
    if not re.fullmatch(r"[0-9a-f]{64}", video.sha256):
        raise ValueError("Ingested video must have a SHA-256 digest.")
    if not math.isfinite(fps) or fps <= 0:
        raise ValueError("fps must be positive and finite.")
    cache = data_dir / "timelines" / f"{video.sha256}-{fps_label(fps)}fps.json"
    if not cache.exists():
        return None
    try:
        saved = json.loads(cache.read_text(encoding="utf-8"))
        timeline = parse_timeline(json.dumps(saved["timeline"]), video.duration_seconds)
        raw_answer = saved["rawAnswer"]
        if not isinstance(raw_answer, str):
            raise ValueError
    except (ValueError, KeyError, TypeError, TimelineError):
        raise TimelineError("Cached timeline is invalid; remove it before trying again.") from None
    return TimelineResult(
        timeline, raw_answer, Decimal(0), True,
        validation_warnings(timeline, video.duration_seconds),
    )


async def draft_timeline(
    video: IngestedVideo, *, client: TimelineClient, data_dir: Path,
    cap: Decimal, fps: float = DEFAULT_FPS,
    on_raw_answer: Callable[[str, int], None] | None = None,
) -> TimelineResult:
    """At most two attempts; the budget is checked before each, including retries."""
    if not isinstance(video, IngestedVideo):
        raise TypeError("Timeline input must be an IngestedVideo returned by ingest_video.")
    if not re.fullmatch(r"[0-9a-f]{64}", video.sha256):
        raise ValueError("Ingested video must have a SHA-256 digest.")
    if not math.isfinite(video.duration_seconds) or video.duration_seconds <= 0:
        raise ValueError("Video duration must be positive and finite.")
    if not math.isfinite(fps) or fps <= 0:
        raise ValueError("fps must be positive and finite.")
    if not cap.is_finite() or cap < 0:
        raise ValueError("Budget cap must be finite and nonnegative.")
    cached = load_cached_timeline(video, data_dir=data_dir, fps=fps)
    if cached is not None:
        return cached
    cache = data_dir / "timelines" / f"{video.sha256}-{fps_label(fps)}fps.json"

    cost = estimated_cost(video.duration_seconds, fps)
    incurred = Decimal(0)
    for attempt in range(2):
        check_budget(data_dir, cap)
        outcome = "failed"
        try:
            # Includes upload, ACTIVE polling, generation and answer validation.
            async with asyncio.timeout(CALL_TIMEOUT_SECONDS):
                raw_answer = await client.generate(
                    video, fps=fps, prompt=TIMELINE_PROMPT, schema=TIMELINE_SCHEMA,
                )
                # Persist received text before any JSON/schema/timing validation.
                # A recording failure aborts rather than paying for another answer.
                if on_raw_answer is not None:
                    on_raw_answer(raw_answer, attempt + 1)
                timeline = parse_timeline(raw_answer, video.duration_seconds)
            outcome = "validated"
        except (TimeoutError, TimelineValidationError, TimelineServiceError) as error:
            retryable = (
                isinstance(error, (TimeoutError, TimelineValidationError))
                or error.status_code == 429
                or (error.status_code is not None and 500 <= error.status_code <= 599)
            )
            reason = "Gemini timeline timed out after 3 minutes." if isinstance(error, TimeoutError) else str(error)
            if not retryable or attempt == 1:
                count = "two attempts" if attempt else "one attempt"
                raise TimelineError(f"Timeline failed after {count}: {reason}") from None
        finally:
            # Conservatively account for failed/timeout attempts too: a provider may
            # have charged even when no answer arrived. Never record request details.
            incurred += cost
            data_dir.mkdir(parents=True, exist_ok=True)
            with (data_dir / "spend.jsonl").open("a", encoding="utf-8") as ledger:
                ledger.write(json.dumps({
                    "at": datetime.now(UTC).isoformat(), "stage": "timeline",
                    "model": MODEL, "sha256": video.sha256, "fps": fps,
                    "costUsd": float(cost), "outcome": outcome,
                }) + "\n")
        if outcome == "validated":
            cache.parent.mkdir(parents=True, exist_ok=True)
            temporary = cache.with_suffix(".tmp")
            temporary.write_text(json.dumps({
                "timeline": timeline.model_dump(), "rawAnswer": raw_answer,
            }), encoding="utf-8")
            temporary.replace(cache)
            return TimelineResult(
                timeline, raw_answer, incurred, False,
                validation_warnings(timeline, video.duration_seconds),
            )
    raise AssertionError("Unreachable timeline retry state.")


class GeminiTimelineClient:
    """Small SDK adapter. Tests supply a fake SDK; imports never construct clients."""

    def __init__(self, sdk):
        self._sdk = sdk

    async def generate(
        self, video: IngestedVideo, *, fps: float, prompt: str, schema: dict,
    ) -> str:
        if not isinstance(video, IngestedVideo):
            raise TypeError("Gemini input must come from ingest_video.")
        mime_type = "video/mov" if video.path.suffix.lower() == ".mov" else "video/mp4"
        try:
            uploaded = await self._sdk.aio.files.upload(
                file=video.path, config={"mime_type": mime_type},
            )
            while getattr(uploaded.state, "name", uploaded.state) != "ACTIVE":
                if getattr(uploaded.state, "name", uploaded.state) != "PROCESSING":
                    raise TimelineServiceError()
                await asyncio.sleep(1)
                uploaded = await self._sdk.aio.files.get(name=uploaded.name)
            response = await self._sdk.aio.interactions.create(
                model=MODEL,
                input=[{
                    "type": "video", "uri": uploaded.uri, "mime_type": mime_type,
                    "resolution": "high", "processing": {"type": "static", "fps": fps},
                }, {"type": "text", "text": prompt}],
                response_format={"type": "text", "mime_type": "application/json", "schema": schema},
                # SDK 3.6 adds automatic continuation hops; keep one request per attempt.
                automatic_continuation=False,
            )
        except (TimeoutError, TimelineServiceError):
            raise
        except Exception as error:
            if "Timeout" in type(error).__name__:
                raise TimeoutError from None
            code = getattr(error, "status_code", None) or getattr(error, "code", None)
            raise TimelineServiceError(code if isinstance(code, int) else None) from None
        # 3.6 exposes steps[].content; older 3.x SDKs exposed outputs[].text.
        parts = [part for step in (getattr(response, "steps", None) or [])
                 if getattr(step, "type", None) == "model_output"
                 for part in (getattr(step, "content", None) or [])]
        if not parts:
            parts = getattr(response, "outputs", None) or []
        answer = "".join(part.text for part in parts
                         if getattr(part, "type", None) == "text" and isinstance(part.text, str))
        # Even empty text reaches the recording hook before JSON validation.
        return answer

    async def aclose(self) -> None:
        await self._sdk.aio.aclose()
        self._sdk.close()


def create_gemini_client(api_key: str) -> GeminiTimelineClient:
    """Only the confirmed manual live command calls this lazy SDK factory."""
    from google import genai

    return GeminiTimelineClient(genai.Client(
        api_key=api_key,
        http_options={"timeout": 180_000, "retry_options": {"attempts": 1}},
    ))
