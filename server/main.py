"""FastAPI entry point for the KSU-GO server."""

import os
import shutil
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from threading import Event as StopEvent
from typing import Annotated, Callable, Literal
from uuid import uuid4

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from access import (
    AccessFirstRoute, EventOwner, OrganizationOwner, RouteOwner, SignedIn, UploadTarget, bearer_token,
)
from errors import APIError
from mock_pipeline import check_budget, run_pipeline
from models import (
    AuthResponse, CreateEventRequest, EditEventRequest, Event, EventDirections, EventRange,
    EventRegistrations, FollowResponse, Health, LoginRequest, MyRegistration, Organization,
    OrganizationRequest, ProfileRequest, Progress, Registration, Route, SignupRequest, StepsRequest, User,
)
from rooms import room_label
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
    timeline_client_factory=None, clock: Callable[[], datetime] = lambda: datetime.now(UTC),
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
        app.state.store = Store(data_dir, fixtures_dir, clock)
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
    # Must be set before any route is declared: access checks run before the body is read.
    app.router.route_class = AccessFirstRoute
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

    @app.post("/api/events", status_code=201)
    def create_event(body: CreateEventRequest, user: SignedIn) -> Event:
        return app.state.store.create_event(body, user)

    @app.put("/api/events/{event_id}")
    def edit_event(event_id: str, body: EditEventRequest, _user: EventOwner) -> Event:
        return app.state.store.edit_event(event_id, body)

    @app.post("/api/events/{event_id}/cancel")
    def cancel_event(event_id: str, _user: EventOwner) -> Event:
        return app.state.store.cancel_event(event_id)

    @app.get("/api/events/{event_id}/registrations")
    def event_registrations(event_id: str, _user: EventOwner) -> EventRegistrations:
        return app.state.store.event_registrations(event_id)

    @app.get("/api/events/{event_id}/directions")
    def event_directions(event_id: str, _user: EventOwner) -> EventDirections:
        return app.state.store.event_directions(event_id)

    @app.get("/api/organizations")
    def organizations() -> list[Organization]:
        return app.state.store.list_organizations()

    @app.get("/api/organizations/{organization_id}")
    def organization(organization_id: str) -> Organization:
        return app.state.store.get_organization(organization_id)

    @app.get("/api/organizations/{organization_id}/events")
    def organization_events(organization_id: str, when: Literal["upcoming", "past"] = "upcoming") -> list[Event]:
        return app.state.store.organization_events(organization_id, when)

    @app.post("/api/organizations", status_code=201)
    def create_organization(body: OrganizationRequest, user: SignedIn) -> Organization:
        return app.state.store.create_organization(body, user)

    @app.put("/api/organizations/{organization_id}")
    def update_organization(organization_id: str, body: OrganizationRequest, _user: OrganizationOwner) -> Organization:
        return app.state.store.update_organization(organization_id, body)

    @app.post("/api/organizations/{organization_id}/follow")
    def follow(organization_id: str, user: SignedIn) -> FollowResponse:
        return app.state.store.set_following(user.id, organization_id, True)

    @app.delete("/api/organizations/{organization_id}/follow")
    def unfollow(organization_id: str, user: SignedIn) -> FollowResponse:
        return app.state.store.set_following(user.id, organization_id, False)

    @app.put("/api/me/profile")
    def update_profile(body: ProfileRequest, user: SignedIn) -> User:
        return app.state.store.update_profile(user.id, body)

    @app.get("/api/me/registrations")
    def my_registrations(user: SignedIn) -> list[MyRegistration]:
        return app.state.store.my_registrations(user.id)

    @app.post("/api/events/{event_id}/register")
    def register(event_id: str, user: SignedIn) -> Registration:
        count = app.state.store.register(event_id, user.id)
        return Registration(registeredCount=count)

    @app.post("/api/auth/signup", status_code=201)
    def signup(body: SignupRequest) -> AuthResponse:
        token, user = app.state.store.signup(body.name, body.email, body.password)
        return AuthResponse(token=token, user=user)

    @app.post("/api/auth/login")
    def login(body: LoginRequest) -> AuthResponse:
        token, user = app.state.store.login(body.email, body.password)
        return AuthResponse(token=token, user=user)

    @app.post("/api/auth/logout", status_code=204)
    def logout(request: Request, _user: SignedIn) -> Response:
        token = bearer_token(request)
        if token is not None:
            app.state.store.logout(token)
        return Response(status_code=204)

    @app.get("/api/me")
    def me(user: SignedIn) -> User:
        return app.state.store.get_user(user.id)

    @app.post("/api/routes", status_code=202)
    def upload_route(
        event: UploadTarget,
        video: Annotated[UploadFile, File()],
        start_floor: Annotated[str, Form(alias="startFloor")],
        destination_floor: Annotated[str, Form(alias="destinationFloor")],
    ) -> Route:
        # The event (from ?eventId) was checked before the video was read: owner,
        # active, not ended, and its room has no confirmed route.
        store = app.state.store
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
            buildingId=event.location.buildingId, destination=room_label(event.location.room),
            startFloor=start_floor, destinationFloor=destination_floor,
            steps=[], checks=[], stats=None,
            createdAt=datetime.now(UTC), confirmedAt=None,
        )
        store.add_upload(pending, event.id, app.state.pipeline_mode)
        live_options = (
            dict(data_dir=data_dir, cap=app.state.budget_cap, client_factory=timeline_client_factory)
            if app.state.pipeline_mode == "live" else {}
        )
        app.state.workers.submit(
            run_pipeline, store, pending, app.state.draft_template, video_sec,
            app.state.pipeline_mode, app.state.stopping, upload_path, stripped_path,
            **live_options,
        )
        return pending

    @app.get("/api/routes/{route_id}")
    def route(route_id: str) -> Route:
        return app.state.store.get_route(route_id)

    @app.put("/api/routes/{route_id}/steps")
    def replace_steps(route_id: str, request: StepsRequest, _user: RouteOwner) -> Route:
        return app.state.store.replace_steps(route_id, request.steps)

    @app.post("/api/routes/{route_id}/confirm")
    def confirm(route_id: str, _user: RouteOwner) -> Route:
        return app.state.store.confirm(route_id)

    return app


app = create_app()
