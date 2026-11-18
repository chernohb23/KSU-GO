"""FastAPI entry point for the KSU-GO server."""

import os
import shutil
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from threading import Event as StopEvent
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from errors import APIError
from mock_pipeline import check_budget, run_pipeline
from models import (
    Event, EventRange, Health, Progress, Registration, RegistrationRequest, Route, StepsRequest,
)
from store import Store
from video import video_duration


SERVER_DIR = Path(__file__).resolve().parent
FIXTURES_DIR = SERVER_DIR.parent / "shared" / "fixtures"


def error_response(error: APIError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status,
        content={"error": {"code": error.code, "message": str(error)}},
    )


def create_app(
    *, data_dir: Path = SERVER_DIR / "data", fixtures_dir: Path = FIXTURES_DIR,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        mode = os.getenv("PIPELINE_MODE", "mock")
        if mode not in ("mock", "live"):
            raise ValueError("PIPELINE_MODE must be mock or live.")
        cap = Decimal(os.getenv("BUDGET_CAP_USD", "14"))
        if not cap.is_finite() or cap < 0:
            raise ValueError("BUDGET_CAP_USD must be a finite, nonnegative number.")
        app.state.pipeline_mode = mode
        app.state.budget_cap = cap
        app.state.store = Store(data_dir, fixtures_dir)
        app.state.draft_template = Route.model_validate_json(
            (fixtures_dir / "route.draft-flawed.json").read_bytes()
        )
        app.state.stopping = StopEvent()
        app.state.workers = ThreadPoolExecutor(max_workers=2, thread_name_prefix="route-pipeline")
        try:
            yield
        finally:
            app.state.stopping.set()
            app.state.workers.shutdown(wait=True, cancel_futures=True)

    app = FastAPI(title="KSU-GO API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
    )

    @app.exception_handler(APIError)
    async def handle_api_error(_request: Request, error: APIError) -> JSONResponse:
        return error_response(error)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, _error: RequestValidationError,
    ) -> JSONResponse:
        return error_response(APIError("invalid_request"))

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, error: StarletteHTTPException) -> Response:
        if error.status_code == 400 and request.method == "POST" and request.url.path == "/api/routes":
            return error_response(APIError("invalid_request"))
        return await http_exception_handler(request, error)

    @app.get("/api/health")
    def health() -> Health:
        return Health(pipelineMode=app.state.pipeline_mode)

    @app.get("/api/events")
    def events(range: EventRange = "today") -> list[Event]:
        return app.state.store.list_events(range)

    @app.get("/api/events/{event_id}")
    def event(event_id: str) -> Event:
        return app.state.store.get_event(event_id)

    @app.post("/api/events/{event_id}/register")
    def register(event_id: str, request: RegistrationRequest) -> Registration:
        count = app.state.store.register(event_id, request.deviceId)
        return Registration(registeredCount=count)

    @app.post("/api/routes", status_code=202)
    def upload_route(
        video: Annotated[UploadFile, File()],
        building_id: Annotated[str, Form(alias="buildingId")],
        destination: Annotated[str, Form()],
        start_floor: Annotated[str, Form(alias="startFloor")],
        destination_floor: Annotated[str, Form(alias="destinationFloor")],
        event_id: Annotated[str | None, Form(alias="eventId")] = None,
    ) -> Route:
        store = app.state.store
        if event_id is not None:
            store.get_event(event_id)
        video_sec = video_duration(video.file)
        check_budget(data_dir, app.state.budget_cap)
        upload_id = f"route-{uuid4()}"
        upload_dir = data_dir / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        upload_path = upload_dir / f"{upload_id}.mov"
        with upload_path.open("wb") as upload_copy:
            video.file.seek(0)
            shutil.copyfileobj(video.file, upload_copy)
        stripped_path = data_dir / "videos" / f"{upload_id}.mov"

        pending = Route(
            id=upload_id, status="processing",
            progress=Progress(stage="ingest", pct=0), error=None,
            buildingId=building_id, destination=destination,
            startFloor=start_floor, destinationFloor=destination_floor,
            steps=[], checks=[], stats=None,
            createdAt=datetime.now(UTC), confirmedAt=None,
        )
        store.add_upload(pending, event_id)
        app.state.workers.submit(
            run_pipeline, store, pending, app.state.draft_template, video_sec,
            app.state.pipeline_mode, app.state.stopping, upload_path, stripped_path,
        )
        return pending

    @app.get("/api/routes/{route_id}")
    def route(route_id: str) -> Route:
        return app.state.store.get_route(route_id)

    @app.put("/api/routes/{route_id}/steps")
    def replace_steps(route_id: str, request: StepsRequest) -> Route:
        return app.state.store.replace_steps(route_id, request.steps)

    @app.post("/api/routes/{route_id}/confirm")
    def confirm(route_id: str) -> Route:
        return app.state.store.confirm(route_id)

    return app


app = create_app()
