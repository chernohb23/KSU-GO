"""Background processing with the fixture pipeline used by AI-1."""

import json
import logging
from decimal import Decimal
from pathlib import Path
from threading import Event
from time import monotonic

from errors import APIError
from models import Door, PipelineMode, Progress, Route, Stage, Stats
from pipeline.ingest import ingest_video
from store import Store


STAGES: tuple[Stage, ...] = ("ingest", "timeline", "geometry", "assemble", "verify")
STAGE_SECONDS = 2.0
LOGGER = logging.getLogger(__name__)


def check_budget(data_dir: Path, cap: Decimal) -> None:
    spent = Decimal(0)
    try:
        with (data_dir / "spend.jsonl").open(encoding="utf-8") as ledger:
            for line in ledger:
                if line.strip():
                    spent += Decimal(str(json.loads(line, parse_float=Decimal)["costUsd"]))
    except FileNotFoundError:
        pass
    if spent >= cap:
        raise APIError("budget_exceeded")


def run_pipeline(
    store: Store, route: Route, template: Route, video_sec: float,
    mode: PipelineMode, stopping: Event, upload_path: Path, stripped_path: Path,
    *, data_dir: Path | None = None, cap: Decimal = Decimal(14), client_factory=None,
) -> None:
    started_at = monotonic()
    try:
        if stopping.is_set():
            return
        try:
            ingested = ingest_video(upload_path, stripped_path)
        finally:
            upload_path.unlink(missing_ok=True)
        if mode == "live":
            # Local import avoids the timeline -> budget guard import cycle.
            from pipeline.run import run_live

            if data_dir is None:
                raise ValueError("Live processing requires a data directory.")
            run_live(store, route, ingested, stopping, data_dir=data_dir, cap=cap,
                     started_at=started_at, client_factory=client_factory)
            return

        started_at = monotonic()
        for index, stage in enumerate(STAGES):
            if stopping.is_set():
                return
            progress = Progress(stage=stage, pct=index * 100 / len(STAGES))
            store.update_upload(route.model_copy(update={"progress": progress}))
            if stopping.wait(STAGE_SECONDS):
                return

        last_step = template.steps[-1]
        if not isinstance(last_step, Door):
            raise ValueError("The mock route fixture must end at a door.")
        steps = [*template.steps[:-1], last_step.model_copy(update={"label": route.destination})]
        store.update_upload(route.model_copy(update={
            "status": "draft",
            "progress": None,
            "corridorWidthM": template.corridorWidthM,
            "ceilingHeightM": template.ceilingHeightM,
            "steps": steps,
            "checks": template.checks,
            "stats": Stats(videoSec=video_sec, processingSec=monotonic() - started_at, costUsd=0),
        }))
    except Exception as error:
        from pipeline.timeline import TimelineError

        if isinstance(error, APIError) and error.code == "budget_exceeded":
            message = "The spend cap is reached. Ask the organizer to check the budget."
        elif isinstance(error, TimelineError):
            message = "The AI couldn't read the video. Please try again."
        else:
            message = "The video could not be processed. Upload the video again."
        # Provider/setup exceptions can contain secrets. Never log their text or traceback.
        LOGGER.error("Processing failed for route %s (%s)", route.id, type(error).__name__)
        store.update_upload(route.model_copy(update={
            "status": "failed", "progress": None,
            "error": message,
        }))
