"""HTTP error codes shared by the API handlers and the mock server."""

from typing import Literal


ErrorCode = Literal[
    "not_found", "invalid_request", "unauthenticated", "forbidden", "wrong_status",
    "route_has_failed_checks", "video_rejected", "budget_exceeded", "room_has_route", "event_cancelled",
]

ERRORS: dict[ErrorCode, tuple[int, str]] = {
    "not_found": (404, "The requested item was not found."),
    "invalid_request": (422, "The request has missing or invalid fields."),
    "unauthenticated": (401, "Sign in to do this."),
    "forbidden": (403, "Only the organization's owner can do this."),
    "wrong_status": (409, "Only draft routes can be edited or confirmed."),
    "route_has_failed_checks": (409, "Fix the failed checks before confirming."),
    "video_rejected": (422, "The video could not be read."),
    "budget_exceeded": (402, "The pipeline spend cap has been reached."),
    "room_has_route": (409, "This room already has directions. Events here use them."),
    "event_cancelled": (409, "This event was cancelled."),
}


class APIError(Exception):
    def __init__(self, code: ErrorCode, message: str | None = None):
        status, default_message = ERRORS[code]
        super().__init__(message or default_message)
        self.code = code
        self.status = status
