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
) -> None:
    try:
        try:
            ingested = ingest_video(upload_path, stripped_path)
        finally:
            upload_path.unlink(missing_ok=True)
        video_path = ingested.path
        video_sha256 = ingested.sha256

        if mode == "live":
            store.update_upload(route.model_copy(update={
                "status": "failed", "progress": None,
                "error": "Live processing is not available yet. Use mock mode.",
            }))
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
    except Exception:
        LOGGER.exception("Processing failed for route %s", route.id)
        store.update_upload(route.model_copy(update={
            "status": "failed", "progress": None,
            "error": "The video could not be processed. Upload the video again.",
        }))
