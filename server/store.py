"""In-memory fixture data and atomic saves for a single server process."""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock

from pydantic import Field, TypeAdapter

from checks import refresh_mock_checks
from errors import APIError
from models import ContractModel, Door, Event, EventRange, EventSeed, Route, Step


class Upload(ContractModel):
    route: Route
    event_id: str | None


class SavedState(ContractModel):
    registrations: dict[str, set[str]] = Field(default_factory=dict)
    uploads: dict[str, Upload] = Field(default_factory=dict)
    event_routes: dict[str, str] = Field(default_factory=dict)


class Store:
    def __init__(self, data_dir: Path, fixtures_dir: Path):
        self._lock = Lock()
        self._path = data_dir / "state.json"
        try:
            self._saved = SavedState.model_validate_json(self._path.read_bytes())
        except FileNotFoundError:
            self._saved = SavedState()

        now = datetime.now(UTC)
        seeds = TypeAdapter(list[EventSeed]).validate_json(
            (fixtures_dir / "events.seed.json").read_bytes()
        )
        self._events: dict[str, Event] = {}
        for seed in seeds:
            fields = seed.model_dump(exclude={"startsInMin", "durationMin"})
            fields["registeredCount"] += len(self._saved.registrations.get(seed.id, ()))
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
        now = datetime.now(UTC)
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

    def register(self, event_id: str, device_id: str) -> int:
        with self._lock:
            event = self._event(event_id)
            devices = self._saved.registrations.get(event_id, set())
            if device_id in devices:
                return event.registeredCount
            registrations = self._saved.registrations | {event_id: devices | {device_id}}
            self._save(self._saved.model_copy(update={"registrations": registrations}))
            updated = event.model_copy(update={"registeredCount": event.registeredCount + 1})
            self._events[event_id] = updated
            return updated.registeredCount

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

    def add_upload(self, route: Route, event_id: str | None) -> None:
        with self._lock:
            self._save_upload(Upload(route=route, event_id=event_id))
            self._routes[route.id] = route

    def update_upload(self, route: Route) -> None:
        with self._lock:
            # A restart fails any processing record regardless of its last stage.
            if route.status != "processing":
                self._replace_route(route)
            else:
                self._routes[route.id] = route

    def _replace_route(self, route: Route, attached_events: tuple[str, ...] = ()) -> None:
        upload = self._saved.uploads.get(route.id)
        if upload is not None:
            self._save_upload(upload.model_copy(update={"route": route}), attached_events)
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
            updated = route.model_copy(update={
                "steps": steps,
                "checks": refresh_mock_checks(steps, route.checks),
            })
            self._replace_route(updated)
            return updated

    def confirm(self, route_id: str) -> Route:
        with self._lock:
            route = self._draft(route_id)
            if any(check.level == "fail" for check in route.checks):
                raise APIError("route_has_failed_checks")

            confirmed = route.model_copy(update={
                "status": "confirmed", "confirmedAt": datetime.now(UTC),
            })
            upload = self._saved.uploads.get(route_id)
            explicit_event = upload.event_id if upload else None
            destination = route.destination.strip().casefold()
            attached = tuple(
                event.id for event in self._events.values()
                if event.id == explicit_event or (
                    event.routeId is None
                    and event.location.buildingId == route.buildingId
                    and f"Room {event.location.room.strip()}".casefold() == destination
                )
            )
            self._replace_route(confirmed, attached)
            for event_id in attached:
                self._events[event_id] = self._events[event_id].model_copy(
                    update={"routeId": route_id},
                )
            return confirmed
