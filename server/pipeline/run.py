"""Live stages executed exclusively by the route worker thread."""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Callable
from decimal import Decimal
from pathlib import Path
from threading import Event
from time import monotonic

from mock_pipeline import check_budget
from models import Progress, Route, Stats
from pipeline.assemble import assemble
from pipeline.ingest import IngestedVideo
from pipeline.motion import measure_video, save_motion
from pipeline.timeline import (
    DEFAULT_FPS, TimelineClient, TimelineError, create_gemini_client,
    draft_timeline, load_cached_timeline,
)
from pipeline.verify import verify
from store import Store


LOGGER = logging.getLogger(__name__)


async def _timeline(
    video: IngestedVideo, data_dir: Path, cap: Decimal,
    client_factory: Callable[[], TimelineClient] | None,
):
    cached = load_cached_timeline(video, data_dir=data_dir, fps=DEFAULT_FPS)
    if cached is not None:
        return cached
    check_budget(data_dir, cap)
    owned = client_factory is None
    if owned:
        # Lazy credential access: a cache hit never constructs an SDK client.
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise TimelineError("Live timeline client is not configured.")
        client = create_gemini_client(api_key)
    else:
        client = client_factory()
    try:
        return await draft_timeline(video, client=client, data_dir=data_dir, cap=cap, fps=DEFAULT_FPS)
    finally:
        if owned:
            await client.aclose()


def run_live(
    store: Store, route: Route, video: IngestedVideo, stopping: Event, *,
    data_dir: Path, cap: Decimal, started_at: float,
    client_factory: Callable[[], TimelineClient] | None = None,
) -> None:
    if stopping.is_set():
        return
    store.update_upload(route.model_copy(update={"progress": Progress(stage="timeline", pct=25)}))
    # This thread owns the loop and SDK lifetime; the ASGI event loop stays free.
    result = asyncio.run(_timeline(video, data_dir, cap, client_factory))
    # Timeline validation currently emits only motion-log density diagnostics.
    # Organizers cannot act on those, so keep them out of checks and saved warnings.
    for message in result.warnings:
        LOGGER.warning("Timeline validation for route %s: %s", route.id, message)
    if stopping.is_set():
        return
    motion = None
    try:
        motion = measure_video(video.path)
    except Exception as error:
        # Motion is an optional check. Decoder/setup errors must not discard a
        # valid timeline, and exception text may contain private input details.
        LOGGER.warning("Motion measurement unavailable for route %s (%s); continuing without it.",
                       route.id, type(error).__name__)
    if stopping.is_set():
        return
    turn_midpoints: dict[str, float] = {}
    store.update_upload(route.model_copy(update={"progress": Progress(stage="assemble", pct=65)}))
    steps, warnings = assemble(result.timeline, destination=route.destination,
                               start_floor=route.startFloor, destination_floor=route.destinationFloor,
                               motion=motion, turn_midpoints=turn_midpoints)
    saved_motion = save_motion(motion, turn_midpoints) if motion is not None else None
    if stopping.is_set():
        return
    store.update_upload(route.model_copy(update={"progress": Progress(stage="verify", pct=85)}))
    checks = verify(steps, start_floor=route.startFloor, destination_floor=route.destinationFloor,
                    video_sec=video.duration_seconds, assemble_warnings=warnings, motion=saved_motion)
    if stopping.is_set():
        return
    store.update_upload(route.model_copy(update={
        "status": "draft", "progress": None, "error": None,
        "steps": steps, "checks": checks, "corridorWidthM": 2.0, "ceilingHeightM": 2.7,
        "stats": Stats(videoSec=video.duration_seconds,
                       processingSec=monotonic() - started_at, costUsd=float(result.cost_usd)),
    }), assemble_warnings=warnings, motion=saved_motion)
