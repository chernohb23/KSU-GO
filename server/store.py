"""In-memory fixture data and atomic saves for a single server process."""

import json
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
    AvatarColor, Campus, Check, ContractModel, CreateEventRequest, Door, EditEventRequest, Event,
    EventDirections, EventRange, EventRegistrations, EventSeed, FollowResponse, MyRegistration,
    Organization, OrganizationRequest, OrganizationSeed, PipelineMode, Profile, ProfileRequest,
    RegisteredPerson, Route, Step, User,
)
from org_rules import organization_fields, slug
from pipeline.motion import SavedMotion
from pipeline.verify import verify
from profile_rules import profile_fields
from rooms import serves_room
from seed_times import seed_start


# A route belongs to the event it was uploaded for. Bundled drafts have no upload
# record, so this table ties them to their event (CONTRACTS.md section 5).
BUNDLED_DRAFT_EVENTS = {"route-math-113-draft": "ev-25"}


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
    password: str  # accounts.hash_password record; never returned or logged
    # Written by phase B and C servers; ignored now that organizers are owners.
    role: str | None = None
    organizationId: str | None = None


class SavedProfile(ContractModel):
    name: str | None = None  # replaces the account name once edited
    major: str | None = None
    classYear: int | None = None
    bio: str | None = None
    avatarColor: AvatarColor = "gold"


class SavedSession(ContractModel):
    userId: str
    expiresAt: AwareDatetime


class SavedState(ContractModel):
    # Device-id registrations from before accounts existed. They still count
    # toward registeredCount but belong to no user.
    registrations: dict[str, set[str]] = Field(default_factory=dict)
    # Phase B per-user registrations without a time; moved into registrations_v2 on load.
    user_registrations: dict[str, set[str]] = Field(default_factory=dict)
    # Event id -> user id -> when that user registered.
    registrations_v2: dict[str, dict[str, AwareDatetime]] = Field(default_factory=dict)
    uploads: dict[str, Upload] = Field(default_factory=dict)
    # Written by older servers; routeId is now derived from the room.
    event_routes: dict[str, str] = Field(default_factory=dict)
    # Signed-up accounts only; demo accounts are rebuilt in memory at startup.
    users: dict[str, SavedUser] = Field(default_factory=dict)
    # Keyed by the SHA-256 of the token; the token itself is never stored.
    sessions: dict[str, SavedSession] = Field(default_factory=dict)
    # Base values; counts, organizer names and routes are applied on read.
    created_events: dict[str, Event] = Field(default_factory=dict)
    # Edited or cancelled seed events, with exact times from then on.
    event_overrides: dict[str, Event] = Field(default_factory=dict)
    # Created organizations and edited seed organizations.
    organizations: dict[str, OrganizationSeed] = Field(default_factory=dict)
    profiles: dict[str, SavedProfile] = Field(default_factory=dict)
    follows: dict[str, list[str]] = Field(default_factory=dict)


SESSION_LIFETIME = timedelta(days=7)


def _upgraded(raw: bytes) -> bytes:
    """Fill fields that older state files lack, so they validate strictly."""
    state = json.loads(raw)
    for event in state.get("created_events", {}).values():
        event.setdefault("status", "active")  # events created before cancelling existed
    return json.dumps(state).encode("utf-8")


class Store:
    def __init__(
        self, data_dir: Path, fixtures_dir: Path,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ):
        self._lock = Lock()
        self._clock = clock
        self._path = data_dir / "state.json"
        try:
            self._saved = SavedState.model_validate_json(_upgraded(self._path.read_bytes()))
        except FileNotFoundError:
            self._saved = SavedState()
        now = self._clock()

        if self._saved.user_registrations:
            # Phase B registrations had no time; they get the migration time.
            migrated = {event_id: dict(users) for event_id, users in self._saved.registrations_v2.items()}
            for event_id, users in self._saved.user_registrations.items():
                for user_id in users:
                    migrated.setdefault(event_id, {}).setdefault(user_id, now)
            self._save(self._saved.model_copy(update={"registrations_v2": migrated, "user_registrations": {}}))

        seed_orgs = TypeAdapter(list[OrganizationSeed]).validate_json(
            (fixtures_dir / "organizations.json").read_bytes()
        )
        self._seed_orgs = {organization.id: organization for organization in seed_orgs}
        campus = Campus.model_validate_json((fixtures_dir / "campus.json").read_bytes())
        self._building_ids = {building.id for building in campus.buildings}

        self._demo_users: dict[str, SavedUser] = {
            account["id"]: SavedUser(
                id=account["id"], name=account["name"], email=account["email"],
                password=accounts.hash_password(account["password"]),
            )
            for account in DEMO_ACCOUNTS
        }
        for organization in self._orgs().values():
            if organization.ownerId is not None and organization.ownerId not in self._all_users():
                raise ValueError(f"Organization {organization.id} names an unknown owner.")

        seeds = TypeAdapter(list[EventSeed]).validate_json((fixtures_dir / "events.seed.json").read_bytes())
        self._events: dict[str, Event] = {}
        for seed in seeds:
            override = self._saved.event_overrides.get(seed.id)
            if override is not None:
                self._events[seed.id] = override
                continue
            starts_at = seed_start(seed.startsInMin, now)
            self._events[seed.id] = Event(
                **seed.model_dump(exclude={"startsInMin", "durationMin"}),
                startsAt=starts_at, endsAt=starts_at + timedelta(minutes=seed.durationMin),
            )
        self._events.update(self._saved.created_events)

        self._routes: dict[str, Route] = {}
        for path in (fixtures_dir / "route.sample.json", *sorted((fixtures_dir / "routes").glob("*.json"))):
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
            self._save(self._saved.model_copy(update={"uploads": self._saved.uploads | interrupted}))
        self._routes.update({route_id: upload.route for route_id, upload in self._saved.uploads.items()})

    def _save(self, state: SavedState) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        pending = self._path.with_suffix(".tmp")
        try:
            pending.write_text(state.model_dump_json(indent=2), encoding="utf-8")
            pending.replace(self._path)
        finally:
            pending.unlink(missing_ok=True)
        self._saved = state

    # ---- Reading events: counts, organizer names and room routes are derived ----

    def _room_route(self, event: Event) -> Route | None:
        """The room's most recently confirmed route."""
        candidates = [
            route for route in self._routes.values()
            if route.status == "confirmed" and route.confirmedAt is not None and serves_room(route, event.location)
        ]
        return max(candidates, key=lambda route: route.confirmedAt) if candidates else None

    def _present(self, event: Event) -> Event:
        host = self._orgs().get(event.organizationId)
        route = self._room_route(event)
        return event.model_copy(update={
            "organizer": host.name if host is not None else event.organizer,
            "routeId": route.id if route is not None else None,
            "registeredCount": event.registeredCount
            + len(self._saved.registrations.get(event.id, ()))
            + len(self._saved.registrations_v2.get(event.id, {})),
        })

    def _event(self, event_id: str) -> Event:
        event = self._events.get(event_id)
        if event is None:
            raise APIError("not_found", "Event not found.")
        return event

    def list_events(self, event_range: EventRange) -> list[Event]:
        now = self._clock()
        cutoff = now + timedelta(days=1 if event_range == "today" else 7)
        with self._lock:
            return sorted(
                (self._present(event) for event in self._events.values()
                 if event.status == "active" and event.endsAt > now and event.startsAt < cutoff),
                key=lambda event: event.startsAt,
            )

    def get_event(self, event_id: str) -> Event:
        with self._lock:
            return self._present(self._event(event_id))

    def organization_events(self, organization_id: str, when: str) -> list[Event]:
        now = self._clock()
        with self._lock:
            self._organization(organization_id)
            hosted = [event for event in self._events.values() if event.organizationId == organization_id]
            if when == "past":
                chosen = sorted((e for e in hosted if e.endsAt <= now), key=lambda e: e.startsAt, reverse=True)
            else:
                chosen = sorted((e for e in hosted if e.endsAt > now), key=lambda e: e.startsAt)
            return [self._present(event) for event in chosen]

    # ---- Registrations ----

    def register(self, event_id: str, user_id: str) -> int:
        with self._lock:
            event = self._event(event_id)
            if event.status == "cancelled":
                raise APIError("event_cancelled")
            users = self._saved.registrations_v2.get(event_id, {})
            if user_id not in users:
                registrations = self._saved.registrations_v2 | {event_id: users | {user_id: self._clock()}}
                self._save(self._saved.model_copy(update={"registrations_v2": registrations}))
            return self._present(event).registeredCount

    def my_registrations(self, user_id: str) -> list[MyRegistration]:
        with self._lock:
            mine = [
                MyRegistration(event=self._present(self._events[event_id]), registeredAt=users[user_id])
                for event_id, users in self._saved.registrations_v2.items()
                if user_id in users and event_id in self._events
            ]
        return sorted(mine, key=lambda registration: registration.event.startsAt)

    def event_registrations(self, event_id: str) -> EventRegistrations:
        with self._lock:
            event = self._event(event_id)
            people = [
                RegisteredPerson(userId=user_id, name=self._user_name(user_id), registeredAt=registered_at)
                for user_id, registered_at in self._saved.registrations_v2.get(event_id, {}).items()
            ]
            return EventRegistrations(
                registeredCount=self._present(event).registeredCount,
                people=sorted(people, key=lambda person: person.registeredAt, reverse=True),
            )

    # ---- Creating, editing and cancelling events ----

    def create_event(self, body: CreateEventRequest, user: User) -> Event:
        with self._lock:
            # The one ownership check after the body: organizationId is in it.
            organization = self._orgs().get(body.organizationId)
            if organization is None or organization.ownerId != user.id:
                raise APIError("forbidden", "You can only create events for an organization you own.")
            fields = new_event_fields(body, host_id=body.organizationId, now=self._clock(),
                                      organizations=self._orgs(), building_ids=self._building_ids)
            event = Event(id=f"ev-{uuid4()}", organizer=organization.name, routeId=None,
                          registeredCount=0, status="active", **fields)
            self._save(self._saved.model_copy(update={"created_events": self._saved.created_events | {event.id: event}}))
            self._events[event.id] = event
            return self._present(event)

    def _store_event(self, event: Event) -> None:
        if event.id in self._saved.created_events:
            self._save(self._saved.model_copy(update={"created_events": self._saved.created_events | {event.id: event}}))
        else:
            self._save(self._saved.model_copy(update={"event_overrides": self._saved.event_overrides | {event.id: event}}))
        self._events[event.id] = event

    def edit_event(self, event_id: str, body: EditEventRequest) -> Event:
        with self._lock:
            current = self._event(event_id)
            if current.status == "cancelled":
                raise APIError("event_cancelled")
            if current.endsAt <= self._clock():
                raise APIError("invalid_request", "This event has ended.")
            fields = new_event_fields(body, host_id=current.organizationId, now=self._clock(),
                                      organizations=self._orgs(), building_ids=self._building_ids,
                                      keep_starts_at=current.startsAt)
            updated = current.model_copy(update=fields)
            self._store_event(updated)
            return self._present(updated)

    def cancel_event(self, event_id: str) -> Event:
        with self._lock:
            current = self._event(event_id)
            if current.status == "cancelled":
                return self._present(current)
            if current.endsAt <= self._clock():
                raise APIError("invalid_request", "This event has ended.")
            cancelled = current.model_copy(update={"status": "cancelled"})
            self._store_event(cancelled)
            return self._present(cancelled)

    # ---- Organizations ----

    def _orgs(self) -> dict[str, OrganizationSeed]:
        return self._seed_orgs | self._saved.organizations

    def _organization(self, organization_id: str) -> OrganizationSeed:
        organization = self._orgs().get(organization_id)
        if organization is None:
            raise APIError("not_found", "Organization not found.")
        return organization

    def _follower_count(self, organization_id: str) -> int:
        return sum(organization_id in followed for followed in self._saved.follows.values())

    def _present_org(self, organization: OrganizationSeed) -> Organization:
        return Organization(**organization.model_dump(), followerCount=self._follower_count(organization.id))

    def list_organizations(self) -> list[Organization]:
        with self._lock:
            return sorted((self._present_org(o) for o in self._orgs().values()), key=lambda o: o.name.casefold())

    def get_organization(self, organization_id: str) -> Organization:
        with self._lock:
            return self._present_org(self._organization(organization_id))

    def _check_name_free(self, name: str, except_id: str | None = None) -> None:
        if any(o.name.casefold() == name.casefold() and o.id != except_id for o in self._orgs().values()):
            raise APIError("invalid_request", "An organization with this name already exists.")

    def create_organization(self, body: OrganizationRequest, user: User) -> Organization:
        fields = organization_fields(body)
        with self._lock:
            self._check_name_free(fields["name"])
            base = f"org-{slug(fields['name'])}"
            organization_id, suffix = base, 2
            while organization_id in self._orgs():
                organization_id, suffix = f"{base}-{suffix}", suffix + 1
            organization = OrganizationSeed(id=organization_id, ownerId=user.id, **fields)
            self._save(self._saved.model_copy(update={"organizations": self._saved.organizations | {organization.id: organization}}))
            return self._present_org(organization)

    def update_organization(self, organization_id: str, body: OrganizationRequest) -> Organization:
        fields = organization_fields(body)
        with self._lock:
            current = self._organization(organization_id)
            self._check_name_free(fields["name"], except_id=organization_id)
            updated = OrganizationSeed(id=current.id, ownerId=current.ownerId, **fields)
            self._save(self._saved.model_copy(update={"organizations": self._saved.organizations | {updated.id: updated}}))
            return self._present_org(updated)

    def set_following(self, user_id: str, organization_id: str, following: bool) -> FollowResponse:
        with self._lock:
            self._organization(organization_id)
            followed = list(self._saved.follows.get(user_id, []))
            if following and organization_id not in followed:
                followed.append(organization_id)
            elif not following and organization_id in followed:
                followed.remove(organization_id)
            if followed != self._saved.follows.get(user_id, []):
                self._save(self._saved.model_copy(update={"follows": self._saved.follows | {user_id: followed}}))
            return FollowResponse(following=following, followerCount=self._follower_count(organization_id))

    # ---- Ownership, checked by access.py before a request body is read ----

    def check_organization_owner(self, organization_id: str, user: User) -> None:
        with self._lock:
            if self._organization(organization_id).ownerId != user.id:
                raise APIError("forbidden")

    def _check_event_owner(self, event: Event, user: User) -> None:
        host = self._orgs().get(event.organizationId)
        if host is None or host.ownerId != user.id:
            raise APIError("forbidden")

    def check_event_owner(self, event_id: str, user: User) -> None:
        with self._lock:
            self._check_event_owner(self._event(event_id), user)

    def _route_event_id(self, route_id: str) -> str | None:
        upload = self._saved.uploads.get(route_id)
        return upload.event_id if upload is not None else BUNDLED_DRAFT_EVENTS.get(route_id)

    def check_route_owner(self, route_id: str, user: User) -> None:
        with self._lock:
            self._route(route_id)
            event = self._events.get(self._route_event_id(route_id) or "")
            if event is None:
                raise APIError("forbidden")
            self._check_event_owner(event, user)

    def check_upload_target(self, event_id: str, user: User) -> Event:
        """The event a video may be uploaded for. Runs before any of the video is read."""
        with self._lock:
            event = self._event(event_id)
            self._check_event_owner(event, user)
            if event.status == "cancelled":
                raise APIError("event_cancelled")
            if event.endsAt <= self._clock():
                raise APIError("invalid_request", "This event has ended.")
            if self._room_route(event) is not None:
                raise APIError("room_has_route")
            return self._present(event)

    # ---- Directions ----

    def event_directions(self, event_id: str) -> EventDirections:
        with self._lock:
            event = self._event(event_id)
            confirmed = self._room_route(event)
            if confirmed is not None:
                return EventDirections(state="confirmed", route=confirmed)
            # Only routes uploaded for this event, and only while it is still in that room.
            own = [
                route for route in self._routes.values()
                if route.status != "confirmed" and self._route_event_id(route.id) == event_id
                and serves_room(route, event.location)
            ]
            if not own:
                return EventDirections(state="none", route=None)
            newest = max(own, key=lambda route: route.createdAt)
            return EventDirections(state=newest.status, route=newest)

    # ---- Accounts, profiles and sessions ----

    def _all_users(self) -> dict[str, SavedUser]:
        return self._saved.users | self._demo_users

    def _user_name(self, user_id: str) -> str:
        profile = self._saved.profiles.get(user_id)
        user = self._all_users().get(user_id)
        return (profile.name if profile and profile.name else None) or (user.name if user else "Former account")

    def _user_view(self, user: SavedUser) -> User:
        saved = self._saved.profiles.get(user.id, SavedProfile())
        return User(
            id=user.id, name=saved.name or user.name, email=user.email,
            profile=Profile(major=saved.major, classYear=saved.classYear, bio=saved.bio, avatarColor=saved.avatarColor),
            ownedOrganizationIds=[o.id for o in self._orgs().values() if o.ownerId == user.id],
            followingOrganizationIds=list(self._saved.follows.get(user.id, [])),
        )

    def get_user(self, user_id: str) -> User:
        with self._lock:
            return self._user_view(self._all_users()[user_id])

    def update_profile(self, user_id: str, body: ProfileRequest) -> User:
        with self._lock:
            fields = profile_fields(body, self._clock())
            self._save(self._saved.model_copy(update={"profiles": self._saved.profiles | {user_id: SavedProfile(**fields)}}))
            return self._user_view(self._all_users()[user_id])

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
            user = SavedUser(id=f"user-{uuid4()}", name=name, email=email, password=record)
            token = self._start_session(user.id, self._saved.users | {user.id: user})
            return token, self._user_view(user)

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
            return self._start_session(user.id), self._user_view(user)

    def user_for_token(self, token: str) -> User | None:
        with self._lock:
            session = self._saved.sessions.get(accounts.token_hash(token))
            if session is None or self._clock() >= session.expiresAt:
                return None
            user = self._all_users().get(session.userId)
            return self._user_view(user) if user is not None else None

    def logout(self, token: str) -> None:
        with self._lock:
            key = accounts.token_hash(token)
            if key in self._saved.sessions:
                sessions = {k: v for k, v in self._saved.sessions.items() if k != key}
                self._save(self._saved.model_copy(update={"sessions": sessions}))

    # ---- Routes ----

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

    def _save_upload(self, upload: Upload) -> None:
        self._save(self._saved.model_copy(update={"uploads": self._saved.uploads | {upload.route.id: upload}}))

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
        self, route: Route, *, assemble_warnings: list[Check] | None = None,
        motion: SavedMotion | None = None,
    ) -> None:
        upload = self._saved.uploads.get(route.id)
        if upload is not None:
            changes = {"route": route}
            if assemble_warnings is not None:
                changes["assemble_warnings"] = assemble_warnings
            if motion is not None:
                changes["motion"] = motion
            self._save_upload(upload.model_copy(update=changes))
        # Bundled routes change in memory only, so a restart brings the stage draft back.
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
            updated = route.model_copy(update={"steps": steps, "checks": checks})
            self._replace_route(updated)
            return updated

    def confirm(self, route_id: str) -> Route:
        with self._lock:
            route = self._draft(route_id)
            if any(check.level == "fail" for check in route.checks):
                raise APIError("route_has_failed_checks")
            room = [r for r in self._routes.values()
                    if r.status == "confirmed" and r.buildingId == route.buildingId
                    and r.destination.strip().casefold() == route.destination.strip().casefold()]
            if room:
                raise APIError("room_has_route")
            # The route becomes its room's route: every event there derives it from now on.
            confirmed = route.model_copy(update={"status": "confirmed", "confirmedAt": self._clock()})
            self._replace_route(confirmed)
            return confirmed
