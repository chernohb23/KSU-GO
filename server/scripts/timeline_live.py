"""Evaluate a paid timeline manually, or replay saved model text entirely offline."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import re
import tempfile
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Sequence

from errors import APIError
from mock_pipeline import check_budget
from pipeline.ingest import VideoRejected, ingest_video
from pipeline.timeline import (
    DEFAULT_FPS, Timeline, TimelineError, create_gemini_client, draft_timeline, estimated_cost,
    fps_label, load_cached_timeline, parse_timeline, total_spend, validation_warnings,
)

SERVER_DIR = Path(__file__).resolve().parents[1]
TURN_NAMES = {
    "turn_left": "left", "turn_right": "right",
    "u_turn_left": "u_turn", "u_turn_right": "u_turn",
    "stairs_up": "stairs_up", "stairs_down": "stairs_down",
    "turn_into_room": "turn_into_room",
}


def turn_sequence(timeline: Timeline) -> list[str]:
    return [TURN_NAMES[event.type] for event in timeline.events if event.type in TURN_NAMES]


def room_matches(observed: str | None, expected: str | None) -> bool:
    """Ignore a leading building prefix, whitespace and case; retain room suffixes."""
    if not observed or not expected:
        return False

    def normalize(room: str) -> str:
        compact = "".join(room.split()).casefold()
        return re.sub(r"^[^0-9]+(?=[0-9])", "", compact)

    return normalize(observed) == normalize(expected)


def edit_distance(actual: Sequence[str], truth: Sequence[str]) -> int:
    """Levenshtein distance: one insertion, deletion or substitution is a correction."""
    def normalize(token: str) -> str:
        return TURN_NAMES.get(token, token)

    previous = list(range(len(truth) + 1))
    for i, observed in enumerate(actual, 1):
        current = [i]
        for j, expected in enumerate(truth, 1):
            current.append(min(
                current[-1] + 1, previous[j] + 1,
                previous[j - 1] + (normalize(observed) != normalize(expected)),
            ))
        previous = current
    return previous[-1]


def recording_text(raw_answer: str) -> str:
    # Store only model JSON text, never the SDK envelope, headers or upload objects.
    # Redact file references if the model unexpectedly echoes one in a note.
    def redact(value):
        if isinstance(value, str):
            return re.sub(
                r'(?:file:/{1,3}|gs://|https?://[^\s"<>]*/files/)[^\s"<>]*',
                "[file reference removed]", value,
            )
        if isinstance(value, dict):
            return {key: redact(item) for key, item in value.items()}
        if isinstance(value, list):
            return [redact(item) for item in value]
        return value

    # Decode first so escaping in a file reference cannot corrupt valid JSON.
    # Malformed JSON must also survive for diagnosis and offline replay.
    try:
        decoded = json.loads(raw_answer)
    except (ValueError, RecursionError):
        return redact(raw_answer)
    try:
        return json.dumps(redact(decoded), indent=2) + "\n"
    except RecursionError:
        return redact(raw_answer)


def save_recording(path: Path, raw_answer: str) -> None:
    # Exclusive creation protects prior paid answers. Close and flush to disk
    # before returning to the validator, even when validation will fail.
    with path.open("x", encoding="utf-8") as output:
        output.write(recording_text(raw_answer))
        output.flush()
        os.fsync(output.fileno())


def print_comparison(
    timeline: Timeline, truth: Sequence[str], room: str | None,
    warnings: Sequence[str] = (),
) -> None:
    for warning in warnings:
        print(f"Warning: {warning}")
    returned = turn_sequence(timeline)
    print(f"Returned: {','.join(returned)}")
    print(f"Truth: {','.join(truth)}")
    print(f"Edit distance: {edit_distance(returned, truth)}")
    print(f"endRoom: {json.dumps(timeline.endRoom)}; expected: {json.dumps(room)}")
    if room is not None:
        print(f"Room match: {room_matches(timeline.endRoom, room)}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path, nargs="?")
    parser.add_argument("--replay", type=Path, help="Validate saved model text without a key or API call")
    parser.add_argument("--duration", type=float, help="Video duration in seconds (required for replay)")
    # Use the shared 2 fps default selected by the campus frame-rate experiment.
    parser.add_argument("--fps", type=float, default=DEFAULT_FPS)
    parser.add_argument("--truth", required=True, help="Comma-separated true turn/stair sequence")
    parser.add_argument("--label")
    parser.add_argument("--room")
    parser.add_argument("--yes", action="store_true", help="Confirm the paid call without prompting")
    args = parser.parse_args(argv)
    if not math.isfinite(args.fps) or args.fps <= 0:
        parser.error("--fps must be positive and finite")
    if args.label is not None and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", args.label):
        parser.error("--label must contain only letters, digits, underscores and hyphens")
    truth = [token.strip() for token in args.truth.split(",") if token.strip()]
    if any(token not in set(TURN_NAMES.values()) | set(TURN_NAMES) for token in truth):
        parser.error("--truth contains an unknown turn/stair type")
    if args.replay is not None:
        if args.video is not None:
            parser.error("Use either a video or --replay")
        if args.duration is None or not math.isfinite(args.duration) or args.duration <= 0:
            parser.error("--replay requires a positive, finite --duration")
        # Exit this branch before accessing credentials, ingest, the ledger or SDK.
        try:
            timeline = parse_timeline(args.replay.read_text(encoding="utf-8"), args.duration)
        except TimelineError as error:
            print(f"Replay failed: {error}")
            return 1
        except (OSError, UnicodeError):
            print("Replay failed: the saved answer could not be read.")
            return 1
        print_comparison(timeline, truth, args.room, validation_warnings(timeline, args.duration))
        print("Replay cost: $0.0000 (no API call)")
        return 0
    if args.video is None or args.label is None:
        parser.error("Live evaluation requires a video and --label")
    if args.duration is not None:
        parser.error("--duration is only used with --replay")
    data_dir = SERVER_DIR / "data"
    recording = SERVER_DIR / "tests" / "recordings" / f"{args.label}-{fps_label(args.fps)}fps.json"
    attempt_paths = [recording.with_stem(f"{recording.stem}-attempt{n}") for n in (1, 2)]
    try:
        with tempfile.TemporaryDirectory(prefix="ksu-timeline-") as temporary:
            stripped = Path(temporary) / f"stripped{args.video.suffix.lower()}"
            video = ingest_video(args.video, stripped)
            cached = load_cached_timeline(video, data_dir=data_dir, fps=args.fps)
            if cached is not None:
                print_comparison(cached.timeline, truth, args.room, cached.warnings)
                print("Cache hit: True, $0")
                return 0
            if recording.exists() or any(path.exists() for path in attempt_paths):
                print("That recording label and frame rate already exist; choose a new label.")
                return 1
            # Never load .env. Credentials and the cap are needed only on a miss.
            api_key = os.environ.get("GEMINI_API_KEY")
            cap_text = os.environ.get("BUDGET_CAP_USD")
            if not api_key or not cap_text:
                print("GEMINI_API_KEY and BUDGET_CAP_USD must already be set in the environment.")
                return 1
            try:
                cap = Decimal(cap_text)
                if not cap.is_finite() or cap < 0:
                    raise InvalidOperation
            except InvalidOperation:
                print("BUDGET_CAP_USD must be a finite, nonnegative number.")
                return 1
            check_budget(data_dir, cap)
            before = total_spend(data_dir)
            print(f"Spend so far: ${before:.4f}; cap: ${cap:.4f}")
            print(f"Estimated cost per attempt: ${estimated_cost(video.duration_seconds, args.fps):.4f}; at most two attempts.")
            if not args.yes:
                try:
                    confirmed = input("Proceed with paid call? [y/N] ").strip().lower() == "y"
                except EOFError:
                    confirmed = False
                if not confirmed:
                    print("Cancelled.")
                    return 0

            recording.parent.mkdir(parents=True, exist_ok=True)

            def save_attempt(raw_answer: str, attempt: int) -> None:
                save_recording(attempt_paths[attempt - 1], raw_answer)

            async def run():
                client = create_gemini_client(api_key)
                try:
                    return await draft_timeline(
                        video, client=client, data_dir=data_dir, cap=cap, fps=args.fps,
                        on_raw_answer=save_attempt,
                    )
                finally:
                    await client.aclose()

            result = asyncio.run(run())
        if result.cached:
            print_comparison(result.timeline, truth, args.room, result.warnings)
            print("Cache hit: True, $0")
            return 0
        save_recording(recording, result.raw_answer)
        print_comparison(result.timeline, truth, args.room, result.warnings)
        print(f"Cost (estimate): ${result.cost_usd:.4f}; total spend: ${total_spend(data_dir):.4f}")
        print(f"Cache hit: {result.cached}; recording: {recording.name}")
        return 0
    except APIError as error:
        print(f"{error.code}: {error}")
    except (TimelineError, VideoRejected) as error:
        print(str(error))
    except (OSError, AssertionError):
        print("Video preparation or local file access failed. Any saved attempt recordings were retained.")
    except Exception:
        # SDK setup errors may include credentials; never print them or a traceback.
        print("Live evaluation failed. Check SDK setup and environment settings.")
    print(f"Total spend: ${total_spend(data_dir):.4f} (estimated ledger)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
