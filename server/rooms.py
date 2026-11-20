"""The one room label (CONTRACTS.md section 2, "Room label"); shared/rooms.ts mirrors it."""

from models import Location, Route


def room_label(room: str) -> str:
    """"Room 204" for a room that starts with a digit; any other room as entered, trimmed ("Atrium")."""
    room = room.strip()
    return f"Room {room}" if room[:1].isdigit() else room


def serves_room(route: Route, location: Location) -> bool:
    """Same building, and the room label equals the route destination, ignoring case and spaces."""
    return (
        route.buildingId == location.buildingId
        and room_label(location.room).casefold() == route.destination.strip().casefold()
    )
