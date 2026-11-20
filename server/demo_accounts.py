"""DEMO-ONLY accounts, rebuilt in memory at every server start.

These passwords are public on purpose: they let judges and teammates try both
experiences. They protect nothing and must never be reused anywhere real. The
server hashes them at startup like any other password and never writes them to
`data/state.json`. app/README.md lists them for people.
"""

from typing import TypedDict

from models import Role


class DemoAccount(TypedDict):
    id: str
    name: str
    email: str
    password: str
    role: Role
    organizationId: str | None


DEMO_ACCOUNTS: tuple[DemoAccount, ...] = (
    {
        "id": "user-demo-student",
        "name": "Maya Chen",
        "email": "student@ksu-go.example",
        "password": "StudentDemo!26",
        "role": "student",
        "organizationId": None,
    },
    {
        "id": "user-demo-organizer",
        "name": "Noah Brooks",
        "email": "organizer@ksu-go.example",
        "password": "OrganizerDemo!26",
        "role": "organizer",
        "organizationId": "org-robotics-club",
    },
)
