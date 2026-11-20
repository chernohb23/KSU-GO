// The one room label (CONTRACTS.md section 2, "Room label"): used for display,
// route doors and the same-room rule. The server's rooms.py mirrors it.

/** "Room 204" for a room that starts with a digit; any other room as entered, trimmed ("Atrium"). */
export function roomLabel(room: string): string {
  const trimmed = room.trim();
  return /^\d/.test(trimmed) ? `Room ${trimmed}` : trimmed;
}

/** Same room: same building, and the room label equals the route destination, ignoring case and spaces. */
export function servesRoom(
  route: { buildingId: string; destination: string },
  location: { buildingId: string; room: string },
): boolean {
  return route.buildingId === location.buildingId
    && roomLabel(location.room).toLowerCase() === route.destination.trim().toLowerCase();
}
