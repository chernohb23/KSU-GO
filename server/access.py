"""Access rules from CONTRACTS.md section 5, as FastAPI dependencies.

An endpoint declares its rule by taking `SignedIn` or `Organizer`. FastAPI
reads and parses a request body (JSON, or a multipart video into a temporary
file) before it runs dependencies, so `AccessFirstRoute` runs these checks
before the body is touched: a request with no token is 401 even when its body
is invalid, and an unauthenticated upload is never read.
"""

from typing import Annotated, Callable

from fastapi import Depends, Request
from fastapi.routing import APIRoute

from errors import APIError
from models import User


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


def organizer(request: Request) -> User:
    user = signed_in(request)
    if user.role != "organizer":
        raise APIError("forbidden")
    return user


SignedIn = Annotated[User, Depends(signed_in)]
Organizer = Annotated[User, Depends(organizer)]
ACCESS_CHECKS: tuple[Callable[[Request], User], ...] = (signed_in, organizer)


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
