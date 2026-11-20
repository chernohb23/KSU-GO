"""Value rules for PUT /api/me/profile (CONTRACTS.md section 5, User)."""

from datetime import datetime
from typing import Any

from errors import APIError
from models import ProfileRequest


def _invalid(message: str) -> APIError:
    return APIError("invalid_request", message)


def _optional(value: str | None, field: str, longest: int) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not 1 <= len(value) <= longest:
        raise _invalid(f"{field} must be 1 to {longest} characters.")
    return value


def profile_fields(body: ProfileRequest, now: datetime) -> dict[str, Any]:
    name = body.name.strip()
    if not 1 <= len(name) <= 80:
        raise _invalid("Name must be 1 to 80 characters.")
    if body.classYear is not None and not now.year - 1 <= body.classYear <= now.year + 7:
        raise _invalid(f"Class year must be from {now.year - 1} to {now.year + 7}.")
    return {
        "name": name,
        "major": _optional(body.major, "Major", 60),
        "classYear": body.classYear,
        "bio": _optional(body.bio, "Bio", 160),
        "avatarColor": body.avatarColor,
    }
