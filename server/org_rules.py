"""Value rules for organizations (CONTRACTS.md section 2, "Organizations")."""

import re
from typing import Any
from urllib.parse import urlsplit

from accounts import normalize_email
from errors import APIError
from models import OrganizationRequest


def _invalid(message: str) -> APIError:
    return APIError("invalid_request", message)


def _text(value: str, field: str, shortest: int, longest: int) -> str:
    value = value.strip()
    if not shortest <= len(value) <= longest:
        raise _invalid(f"{field} must be {shortest} to {longest} characters.")
    return value


def _optional(value: str | None, field: str, longest: int) -> str | None:
    return None if value is None else _text(value, field, 1, longest)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.casefold()).strip("-") or "organization"


def organization_fields(body: OrganizationRequest) -> dict[str, Any]:
    """Every client-supplied Organization field, checked and normalized."""
    initials = body.logo.initials.strip()
    if not re.fullmatch(r"[A-Z]{1,4}", initials):
        raise _invalid("Logo initials must be 1 to 4 capital letters.")
    if not 0 <= body.memberCount <= 100_000:
        raise _invalid("memberCount must be 0 to 100000.")
    email = None
    if body.contactEmail is not None:
        email = normalize_email(body.contactEmail)
        local, at, domain = email.partition("@")
        if len(email) > 254 or not at or not local or not domain or "@" in domain or " " in email:
            raise _invalid("Enter a valid contact email.")
    website = None
    if body.website is not None:
        website = body.website.strip()
        parts = urlsplit(website)
        if len(website) > 200 or parts.scheme != "https" or not parts.netloc or any(c.isspace() for c in website):
            raise _invalid("The website must be an https:// address of at most 200 characters.")
    return {
        "name": _text(body.name, "name", 2, 60),
        "description": _text(body.description, "description", 1, 280),
        "logo": {"initials": initials, "color": body.logo.color},
        "memberCount": body.memberCount,
        "meets": _optional(body.meets, "meets", 80),
        "contactEmail": email,
        "website": website,
    }
