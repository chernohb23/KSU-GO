"""Value rules for POST /api/events (CONTRACTS.md section 5, "Creating events")."""

from datetime import datetime, timedelta
from typing import Any

from errors import APIError
from models import CreateEventRequest, Location, Organization


CREATE_WINDOW = timedelta(days=7)
MAX_TAGS = 8


def _invalid(message: str) -> APIError:
    return APIError("invalid_request", message)


def _text(value: str, field: str, longest: int) -> str:
    value = value.strip()
    if not 1 <= len(value) <= longest:
        raise _invalid(f"{field} must be 1 to {longest} characters.")
    return value


def normalized_tags(tags: list[str]) -> list[str]:
    result: list[str] = []
    for raw in tags:
        tag = raw.strip().lower()
        if not 1 <= len(tag) <= 24:
            raise _invalid("Each tag must be 1 to 24 characters.")
        if tag not in result:
            result.append(tag)
    if len(result) > MAX_TAGS:
        raise _invalid(f"Use at most {MAX_TAGS} different tags.")
    return result


def parse_starts_at(value: str, now: datetime) -> datetime:
    try:
        starts_at = datetime.fromisoformat(value)
    except ValueError:
        starts_at = None
    if starts_at is None or starts_at.utcoffset() is None:
        raise _invalid("startsAt must be an ISO 8601 date and time with an offset.")
    if not now < starts_at < now + CREATE_WINDOW:
        raise _invalid("startsAt must be in the future and within the next 7 days.")
    return starts_at


def new_event_fields(
    body: CreateEventRequest, *, now: datetime,
    organizations: dict[str, Organization], building_ids: set[str],
) -> dict[str, Any]:
    """Every client-supplied Event field, checked and normalized.

    The caller has already matched organizationId to the signed-in organizer.
    """
    if body.organizationId not in organizations:
        raise _invalid("Unknown organizationId.")
    partner = body.partnerOrganizationId
    if partner is not None and partner not in organizations:
        raise _invalid("Unknown partnerOrganizationId.")
    if partner == body.organizationId:
        raise _invalid("The partner organization must differ from the host.")
    if body.location.buildingId not in building_ids:
        raise _invalid("Unknown buildingId.")
    if not 1 <= body.durationMin <= 1440:
        raise _invalid("durationMin must be 1 to 1440.")
    if body.capacity is not None and body.capacity < 1:
        raise _invalid("capacity must be null or at least 1.")
    starts_at = parse_starts_at(body.startsAt, now)
    return {
        "title": _text(body.title, "title", 120),
        "description": _text(body.description, "description", 2000),
        "organizationId": body.organizationId,
        "partnerOrganizationId": partner,
        "category": body.category,
        "tags": normalized_tags(body.tags),
        "startsAt": starts_at,
        "endsAt": starts_at + timedelta(minutes=body.durationMin),
        "location": Location(
            buildingId=body.location.buildingId, room=_text(body.location.room, "room", 40),
        ),
        "capacity": body.capacity,
    }
