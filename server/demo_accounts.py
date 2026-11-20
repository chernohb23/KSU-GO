"""DEMO-ONLY accounts, rebuilt in memory at every server start.

These passwords are public on purpose: they let judges and teammates try both
experiences. They protect nothing and must never be reused anywhere real. The
server hashes them at startup like any other password and never writes them to
`data/state.json`. app/README.md lists them for people.
"""

from typing import TypedDict


class DemoAccount(TypedDict):
    id: str
    name: str
    email: str
    password: str


# Noah owns org-robotics-club through its ownerId in organizations.json.
DEMO_ACCOUNTS: tuple[DemoAccount, ...] = (
    {
        "id": "user-demo-student",
        "name": "Maya Chen",
        "email": "student@ksu-go.example",
        "password": "StudentDemo!26",
    },
    {
        "id": "user-demo-organizer",
        "name": "Noah Brooks",
        "email": "organizer@ksu-go.example",
        "password": "OrganizerDemo!26",
    },
)
