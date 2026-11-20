"""In-memory fixture data and atomic saves for a single server process."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock
from uuid import uuid4

from pydantic import AwareDatetime, Field, TypeAdapter

import accounts
from checks import refresh_mock_checks
from demo_accounts import DEMO_ACCOUNTS
from errors import APIError
from event_rules import new_event_fields
from models import (
    Campus, Check, ContractModel, CreateEventRequest, Door, Event, EventRange, EventSeed, Location,
    Organization, PipelineMode, Role, Route, Step, User,
)
from pipeline.motion import SavedMotion
from pipeline.verify import verify


class Upload(ContractModel):
    route: Route
    event_id: str | None
    pipeline_mode: PipelineMode = "mock"
    assemble_warnings: list[Check] = Field(default_factory=list)
    motion: SavedMotion | None = None


class SavedUser(ContractModel):
    id: str
    name: str
    email: str
    role: Role
    organizationId: str | None
    password: str  # accounts.hash_password record; never returned or logged


class SavedSession(ContractModel):
    userId: str
    expiresAt: AwareDatetime


class SavedState(ContractModel):
    # Device-id registrations from before accounts existed. They still count
    # toward registeredCount but belong to no user.
    registrations: dict[str, set[str]] = Field(default_factory=dict)
    user_registrations: dict[str, set[str]] = Field(default_factory=dict)
    uploads: dict[str, Upload] = Field(default_factory=dict)
    event_routes: dict[str, str] = Field(default_factory=dict)
    # Signed-up accounts only; demo accounts are rebuilt in memory at startup.
    users: dict[str, SavedUser] = Field(default_factory=dict)
    # Keyed by the SHA-256 of the token; the token itself is never stored.
    sessions: dict[str, SavedSession] = Field(default_factory=dict)
    # Base values (registeredCount 0); counts and route links are applied on load.
    created_events: dict[str, Event] = Field(default_factory=dict)


SESSION_LIFETIME = timedelta(days=7)


def serves_room(route: Route, location: Location) -> bool:
    """The same-room rule of POST /api/routes/{id}/confirm."""
    return (
        route.buildingId == location.buildingId
        and f"Room {location.room.strip()}".casefold() == route.destination.strip().casefold()
    )


def _user_view(user: SavedUser) -> User:
    return User(
        id=user.id, name=user.name, email=user.email, role=user.role,
        organizationId=user.organizationId,
    )


class Store:
    def __init__(
        self, data_dir: Path, fixtures_dir: Path,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ):
        self._lock = Lock()
        self._clock = clock
        self._path = data_dir / "state.json"
        try:
            self._saved = SavedState.model_validate_json(self._path.read_bytes())
        except FileNotFoundError:
            self._saved = SavedState()

        organizations = TypeAdapter(list[Organization]).validate_json(
            (fixtures_dir / "organizations.json").read_bytes()
        )
        self._organizations = {organization.id: organization for organization in organizations}
        campus = Campus.model_validate_json((fixtures_dir / "campus.json").read_bytes())
        self._building_ids = {building.id for building in campus.buildings}

        self._demo_users: dict[str, SavedUser] = {}
        for account in DEMO_ACCOUNTS:
            organization_id = account["organizationId"]
            if organization_id is not None and organization_id not in self._organizations:
                raise ValueError(f"Demo account {account['id']} names an unknown organization.")
            self._demo_users[account["id"]] = SavedUser(
                id=account["id"], name=account["name"], email=account["email"],
                role=account["role"], organizationId=organization_id,
                password=accounts.hash_password(account["password"]),
            )

        now = self._clock()
        seeds = TypeAdapter(list[EventSeed]).validate_json(
            (fixtures_dir / "events.seed.json").read_bytes()
        )
        self._events: dict[str, Event] = {}
        for seed in seeds:
            fields = seed.model_dump(exclude={"startsInMin", "durationMin"})
            fields["registeredCount"] += self._saved_registrations(seed.id)
            fields["routeId"] = self._saved.event_routes.get(seed.id, seed.routeId)
            starts_at = now + timedelta(minutes=seed.startsInMin)
            event = Event(
                **fields,
                startsAt=starts_at,
                endsAt=starts_at + timedelta(minutes=seed.durationMin),
            )
            self._events[event.id] = event

        self._routes: dict[str, Route] = {}
        for path in (
            fixtures_dir / "route.sample.json",
            *sorted((fixtures_dir / "routes").glob("*.json")),
        ):
            route = Route.model_validate_json(path.read_bytes())
            self._routes[route.id] = route

        interrupted = {}
        for route_id, upload in self._saved.uploads.items():
            if upload.route.status == "processing":
                failed = upload.route.model_copy(update={
                    "status": "failed", "progress": None,
                    "error": "The server restarted. Upload the video again.",
                })
                interrupted[route_id] = upload.model_copy(update={"route": failed})
        if interrupted:
            self._save(self._saved.model_copy(update={
                "uploads": self._saved.uploads | interrupted,
            }))
        self._routes.update({
            route_id: upload.route for route_id, upload in self._saved.uploads.items()
        })

        # Created events keep their exact times. A fixture route confirmed in an
        # earlier run is a draft again after a restart, so a link to a route
        # that is no longer confirmed is derived again from the room.
        for event_id, base in self._saved.created_events.items():
            route_id = self._saved.event_routes.get(event_id, base.routeId)
            route = self._routes.get(route_id) if route_id is not None else None
            if route is None or route.status != "confirmed":
                route_id = self._room_route(base.location)
            self._events[event_id] = base.model_copy(update={
                "routeId": route_id,
                "registeredCount": base.registeredCount + self._saved_registrations(event_id),
            })

    def _saved_registrations(self, event_id: str) -> int:
        return (
            len(self._saved.registrations.get(event_id, ()))
            + len(self._saved.user_registrations.get(event_id, ()))
        )

    def _room_route(self, location: Location) -> str | None:
        """The most recently confirmed route that serves this room."""
        candidates = [
            route for route in self._routes.values()
            if route.status == "confirmed" and route.confirmedAt is not None
            and serves_room(route, location)
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda route: route.confirmedAt).id

    def _save(self, state: SavedState) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        pending = self._path.with_suffix(".tmp")
        try:
            pending.write_text(state.model_dump_json(indent=2), encoding="utf-8")
            pending.replace(self._path)
        finally:
            pending.unlink(missing_ok=True)
        self._saved = state

    def list_events(self, event_range: EventRange) -> list[Event]:
        now = self._clock()
        cutoff = now + timedelta(days=1 if event_range == "today" else 7)
        with self._lock:
            return sorted(
                (event for event in self._events.values()
                 if event.endsAt > now and event.startsAt < cutoff),
                key=lambda event: event.startsAt,
            )

    def _event(self, event_id: str) -> Event:
        event = self._events.get(event_id)
        if event is None:
            raise APIError("not_found", "Event not found.")
        return event

    def get_event(self, event_id: str) -> Event:
        with self._lock:
            return self._event(event_id)

    def register(self, event_id: str, user_id: str) -> int:
        with self._lock:
            event = self._event(event_id)
            users = self._saved.user_registrations.get(event_id, set())
            if user_id in users:
                return event.registeredCount
            registrations = self._saved.user_registrations | {event_id: users | {user_id}}
            self._save(self._saved.model_copy(update={"user_registrations": registrations}))
            updated = event.model_copy(update={"registeredCount": event.registeredCount + 1})
            self._events[event_id] = updated
            return updated.registeredCount

    def create_event(self, body: CreateEventRequest, user: User) -> Event:
        if body.organizationId != user.organizationId:
            raise APIError("forbidden", "You can only create events for your own organization.")
        with self._lock:
            fields = new_event_fields(
                body, now=self._clock(), organizations=self._organizations,
                building_ids=self._building_ids,
            )
            event = Event(
                id=f"ev-{uuid4()}",
                organizer=self._organizations[body.organizationId].name,
                routeId=self._room_route(fields["location"]),
                registeredCount=0,
                **fields,
            )
            created = self._saved.created_events | {event.id: event}
            self._save(self._saved.model_copy(update={"created_events": created}))
            self._events[event.id] = event
            return event

    # ---- Accounts and sessions ----

    def _all_users(self) -> dict[str, SavedUser]:
        return self._saved.users | self._demo_users

    def _start_session(self, user_id: str, users: dict[str, SavedUser] | None = None) -> str:
        """Save a new session (and any new user) and return its token. Hold the lock."""
        now = self._clock()
        token = accounts.new_token()
        sessions = {
            key: session for key, session in self._saved.sessions.items() if session.expiresAt > now
        } | {accounts.token_hash(token): SavedSession(userId=user_id, expiresAt=now + SESSION_LIFETIME)}
        changes: dict[str, object] = {"sessions": sessions}
        if users is not None:
            changes["users"] = users
        self._save(self._saved.model_copy(update=changes))
        return token

    def signup(self, name: str, email: str, password: str) -> tuple[str, User]:
        name, email = accounts.checked_signup(name, email, password)
        record = accounts.hash_password(password)  # slow on purpose; outside the lock
        with self._lock:
            if any(user.email == email for user in self._all_users().values()):
                raise APIError("invalid_request", "An account with this email already exists.")
            user = SavedUser(
                id=f"user-{uuid4()}", name=name, email=email, role="student",
                organizationId=None, password=record,
            )
            token = self._start_session(user.id, self._saved.users | {user.id: user})
            return token, _user_view(user)

    def login(self, email: str, password: str) -> tuple[str, User]:
        email = accounts.normalize_email(email)
        with self._lock:
            user = next((u for u in self._all_users().values() if u.email == email), None)
        if user is None:
            accounts.burn_password_check(password)
            raise APIError("unauthenticated", "Email or password is wrong.")
        if not accounts.verify_password(password, user.password):
            raise APIError("unauthenticated", "Email or password is wrong.")
        with self._lock:
            return self._start_session(user.id), _user_view(user)

    def user_for_token(self, token: str) -> User | None:
        with self._lock:
            session = self._saved.sessions.get(accounts.token_hash(token))
            if session is None or self._clock() >= session.expiresAt:
                return None
            user = self._all_users().get(session.userId)
            return _user_view(user) if user is not None else None

    def logout(self, token: str) -> None:
        with self._lock:
            key = accounts.token_hash(token)
            if key in self._saved.sessions:
                sessions = {k: v for k, v in self._saved.sessions.items() if k != key}
                self._save(self._saved.model_copy(update={"sessions": sessions}))

    def _route(self, route_id: str) -> Route:
        route = self._routes.get(route_id)
        if route is None:
            raise APIError("not_found", "Route not found.")
        return route

    def _draft(self, route_id: str) -> Route:
        route = self._route(route_id)
        if route.status != "draft":
            raise APIError("wrong_status")
        return route

    def get_route(self, route_id: str) -> Route:
        with self._lock:
            return self._route(route_id)

    def _save_upload(self, upload: Upload, attached_events: tuple[str, ...] = ()) -> None:
        uploads = self._saved.uploads | {upload.route.id: upload}
        event_routes = self._saved.event_routes | dict.fromkeys(attached_events, upload.route.id)
        self._save(self._saved.model_copy(update={"uploads": uploads, "event_routes": event_routes}))

    def add_upload(self, route: Route, event_id: str | None, mode: PipelineMode = "mock") -> None:
        with self._lock:
            self._save_upload(Upload(route=route, event_id=event_id, pipeline_mode=mode))
            self._routes[route.id] = route

    def update_upload(
        self, route: Route, *, assemble_warnings: list[Check] | None = None,
        motion: SavedMotion | None = None,
    ) -> None:
        with self._lock:
            # A restart fails any processing record regardless of its last stage.
            if route.status != "processing":
                self._replace_route(route, assemble_warnings=assemble_warnings, motion=motion)
            else:
                self._routes[route.id] = route

    def _replace_route(
        self, route: Route, attached_events: tuple[str, ...] = (), *,
        assemble_warnings: list[Check] | None = None,
        motion: SavedMotion | None = None,
    ) -> None:
        upload = self._saved.uploads.get(route.id)
        if upload is not None:
            changes = {"route": route}
            if assemble_warnings is not None:
                changes["assemble_warnings"] = assemble_warnings
            if motion is not None:
                changes["motion"] = motion
            self._save_upload(upload.model_copy(update=changes), attached_events)
        self._routes[route.id] = route

    def replace_steps(self, route_id: str, steps: list[Step]) -> Route:
        with self._lock:
            route = self._draft(route_id)
            if not steps or not isinstance(steps[0], Door) or not isinstance(steps[-1], Door):
                raise APIError("invalid_request", "The steps must start and end with a door.")
            if steps[-1].label != route.destination:
                raise APIError("invalid_request", "The last door must be labeled with the destination.")
            if len({step.id for step in steps}) != len(steps):
                raise APIError("invalid_request", "Each step must have a unique ID.")
            upload = self._saved.uploads.get(route_id)
            checks = (
                verify(steps, start_floor=route.startFloor, destination_floor=route.destinationFloor,
                       video_sec=route.stats.videoSec if route.stats else None,
                       assemble_warnings=upload.assemble_warnings, motion=upload.motion)
                if upload is not None and upload.pipeline_mode == "live"
                else refresh_mock_checks(steps, route.checks)
            )
            updated = route.model_copy(update={
                "steps": steps,
                "checks": checks,
            })
            self._replace_route(updated)
            return updated

    def confirm(self, route_id: str) -> Route:
        with self._lock:
            route = self._draft(route_id)
            if any(check.level == "fail" for check in route.checks):
                raise APIError("route_has_failed_checks")

            confirmed = route.model_copy(update={
                "status": "confirmed", "confirmedAt": self._clock(),
            })
            upload = self._saved.uploads.get(route_id)
            explicit_event = upload.event_id if upload else None
            attached = tuple(
                event.id for event in self._events.values()
                if event.id == explicit_event or (
                    event.routeId is None and serves_room(route, event.location)
                )
            )
            self._replace_route(confirmed, attached)
            for event_id in attached:
                self._events[event_id] = self._events[event_id].model_copy(
                    update={"routeId": route_id},
                )
            return confirmed
