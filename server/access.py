"""Access rules from CONTRACTS.md section 5, as FastAPI dependencies.

An endpoint declares its rule by taking one of the annotated types below.
FastAPI reads and parses a request body (JSON, or a multipart video into a
temporary file) before it runs dependencies, so `AccessFirstRoute` runs these
checks first: a request with no token is 401, and a non-owner is 403, even
when the body is invalid, and an upload a user may not make is never read.
Ownership comes from ids in the path or query. The one check that needs the
body, POST /api/events, lives in the store.
"""

from typing import Annotated, Callable

from fastapi import Depends, Request
from fastapi.routing import APIRoute

from errors import APIError
from models import Event, User


def bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    token = token.strip()
    return token if scheme.lower() == "bearer" and token else None


def signed_in(request: Request) -> User:
    cached = getattr(request.state, "user", None)
    if isinstance(cached, User):
        return cached
    token = bearer_token(request)
    user = request.app.state.store.user_for_token(token) if token else None
    if user is None:
        raise APIError("unauthenticated")
    request.state.user = user
    return user


def organization_owner(request: Request) -> User:
    user = signed_in(request)
    request.app.state.store.check_organization_owner(request.path_params["organization_id"], user)
    return user


def event_owner(request: Request) -> User:
    user = signed_in(request)
    request.app.state.store.check_event_owner(request.path_params["event_id"], user)
    return user


def route_owner(request: Request) -> User:
    user = signed_in(request)
    request.app.state.store.check_route_owner(request.path_params["route_id"], user)
    return user


def upload_target(request: Request) -> Event:
    """The event named by ?eventId, checked before the video is read."""
    cached = getattr(request.state, "upload_event", None)
    if isinstance(cached, Event):
        return cached
    user = signed_in(request)
    event_id = request.query_params.get("eventId")
    if not event_id:
        raise APIError("invalid_request", "Upload directions from an event: eventId is required.")
    event = request.app.state.store.check_upload_target(event_id, user)
    request.state.upload_event = event
    return event


SignedIn = Annotated[User, Depends(signed_in)]
OrganizationOwner = Annotated[User, Depends(organization_owner)]
EventOwner = Annotated[User, Depends(event_owner)]
RouteOwner = Annotated[User, Depends(route_owner)]
UploadTarget = Annotated[Event, Depends(upload_target)]
ACCESS_CHECKS: tuple[Callable[[Request], object], ...] = (
    signed_in, organization_owner, event_owner, route_owner, upload_target,
)


class AccessFirstRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        checks = [dep.call for dep in self.dependant.dependencies if dep.call in ACCESS_CHECKS]
        if not checks:
            return handler

        async def checked_handler(request: Request):
            for check in checks:
                check(request)
            return await handler(request)

        return checked_handler
