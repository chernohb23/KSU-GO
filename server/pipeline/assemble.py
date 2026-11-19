"""Deterministic timeline-to-step assembly. No files, clients, or paid calls."""

from __future__ import annotations

import re

from models import Check, Door, Stairs, Step, Turn, Walk
from pipeline.timeline import GAP_WALK_NOTE, Timeline, TimelineEvent

TURN_DIRECTIONS = {
    "turn_left": "left", "turn_right": "right",
    "u_turn_left": "u_left", "u_turn_right": "u_right",
}


def _base(event: TimelineEvent | None, *, time: float = 0) -> dict:
    # The timeline schema requires numeric confidence; its stable gap marker also
    # survives cache serialization. A gap has no AI confidence in Route steps.
    gap = event and event.type == "walk" and event.confidence == 0 and event.note == GAP_WALK_NOTE
    return dict(id="", source="ai", confidence=event.confidence if event and not gap else None,
                tSec=event.startSec if event else time,
                note=(event.note or None) if event and event.confidence >= 0.8 else None)


def _note(step: Step, text: str) -> None:
    parts = [part.strip() for note in (step.note or "", text) for part in note.split("; ")]
    step.note = "; ".join(dict.fromkeys(part for part in parts if part)) or None


def _cap_note(text: str | None) -> str | None:
    if not text:
        return None
    text = " ".join(text.split())
    if len(text) <= 80:
        return text or None
    prefix = text[:79]
    if not text[79].isspace():
        prefix = prefix.rsplit(" ", 1)[0] if " " in prefix else ""
    return prefix.rstrip(" ;") + "…"


def _walking_seconds(event: TimelineEvent, pauses: list[TimelineEvent]) -> float:
    # Subtract the union, even for hand-written timelines with overlapping pauses.
    cursor = event.startSec
    paused = 0.0
    for pause in sorted(pauses, key=lambda item: item.startSec):
        start = max(cursor, event.startSec, pause.startSec)
        end = min(event.endSec, pause.endSec)
        if end > start:
            paused += end - start
            cursor = end
    return max(0.0, event.endSec - event.startSec - paused)


def assemble(
    timeline: Timeline, *, destination: str, start_floor: str, destination_floor: str,
    motion: object | None = None,
) -> tuple[list[Step], list[Check]]:
    """Return fresh steps and assembly warnings; organizer floors are authoritative.

    Merged steps retain the earliest timestamp and the lowest known confidence.
    Synthetic doors and gap walks have unknown confidence; inferred turns have
    confidence 0.3 for review. Notes are deduplicated before the final 80-char cap.
    """
    events = timeline.events
    steps: list[Step] = []
    pending: list[tuple[str, str, Step | None]] = []

    def warn(check_id: str, message: str, step: Step | None = None) -> None:
        pending.append((check_id, message, step))

    entrance = events[0] if events and events[0].type == "door" else None
    steps.append(Door(**_base(entrance), type="door", label="Main entrance"))
    pauses = [event for event in events if event.type in {"sign", "pan"}]
    # Associate notes by interval distance, before adjacent walks are merged.
    walks: list[tuple[Walk, TimelineEvent]] = []
    flights: list[tuple[Stairs, TimelineEvent]] = []
    room_turn = None
    for event in events:
        if event.type == "walk":
            seconds = _walking_seconds(event, pauses)
            if seconds > 0:
                walk = Walk(**_base(event), type="walk", lengthM=seconds * 0.7)
                steps.append(walk)
                walks.append((walk, event))
        elif event.type in TURN_DIRECTIONS or event.type == "turn_into_room":
            direction = TURN_DIRECTIONS.get(event.type)
            if direction is None:
                # AI-3 encodes this event's side in its note, not a schema field.
                sides = set(re.findall(r"\b(left|right)\b", event.note.lower()))
                direction = next(iter(sides)) if len(sides) == 1 else "right"
            turn = Turn(**_base(event), type="turn", direction=direction)
            steps.append(turn)
            if event.type == "turn_into_room":
                if len(set(re.findall(r"\b(left|right)\b", event.note.lower()))) != 1:
                    warn("room_turn_side", "The room turn's side was unclear. A right turn was used; review it.", turn)
                room_turn = event
                # Room entry is the destination marker, including when validation
                # filled a trailing gap with a walk after a final room sign.
                break
        elif event.type in {"stairs_up", "stairs_down"}:
            stair = Stairs(**_base(event), type="stairs",
                           direction="up" if event.type == "stairs_up" else "down",
                           riseM=1.8, runM=2.88, toFloor=None)
            steps.append(stair)
            flights.append((stair, event))
        # Doors in the middle are notes; signs and pans never move the route.

    start = end = None
    if re.fullmatch(r"[+-]?[0-9]+", start_floor.strip()) and re.fullmatch(r"[+-]?[0-9]+", destination_floor.strip()):
        # Avoid enormous integers from untrusted form text.
        if len(start_floor.strip()) <= 9 and len(destination_floor.strip()) <= 9:
            start, end = int(start_floor), int(destination_floor)
            if start % 100 == end % 100 == 0:
                start //= 100
                end //= 100
                warn("floor_numbering", "Both floors are multiples of 100; treated as /100 for stair heights.")
    difference = end - start if start is not None and end is not None else None
    directions = {step.direction for step, _ in flights}
    fits = (difference is not None and difference != 0 and bool(flights)
            and directions == {"up" if difference > 0 else "down"})
    rise = abs(difference) * 3.6 / len(flights) if fits else 1.8
    # Bad floor entry must not generate a tower hundreds of meters high.
    if rise > 18:
        fits, rise = False, 1.8
    if not fits and (flights or difference != 0):
        warn("stair_floors", "The floor entries and stair flights do not fit. Used 1.8 m per flight; review the floors and stairs.")
    for index, (stair, _) in enumerate(flights, 1):
        stair.riseM = round(rise, 6)
        stair.runM = round(rise * 1.6, 6)
        if index == len(flights):
            stair.toFloor = destination_floor
        elif fits and difference and len(flights) % abs(difference) == 0:
            per_floor = len(flights) // abs(difference)
            if index % per_floor == 0:
                floor = start + (1 if difference > 0 else -1) * (index // per_floor)
                # Preserve room-style floor labels in the wire steps.
                stair.toFloor = str(floor * 100 if int(start_floor) % 100 == int(destination_floor) % 100 == 0 else floor)

    for (first, first_event), (second, second_event) in zip(flights, flights[1:]):
        if first.direction != second.direction or not 0 <= second_event.startSec - first_event.endSec < 8:
            continue
        first_index = next(i for i, step in enumerate(steps) if step is first)
        second_index = next(i for i, step in enumerate(steps) if step is second)
        turns = [step for step in steps[first_index + 1:second_index] if isinstance(step, Turn)]
        if len(turns) == 1 and turns[0].direction in {"left", "right"}:
            turns[0].direction = "u_" + turns[0].direction
            warn("switchback_turn", "A single turn between stair flights became a U-turn. Review its side.", turns[0])
        elif len(turns) == 2 and turns[0].direction == turns[1].direction and turns[0].direction in {"left", "right"}:
            turns[0].direction = "u_" + turns[0].direction
            turns[0].confidence = min(turn.confidence for turn in turns)
            _note(turns[0], turns[1].note or "")
            steps = [step for step in steps if step is not turns[1]]
        elif not turns:
            # TODO(AI-7): use optional motion results for the switchback side.
            # TODO(AI-7): supplement missing turns and attach turn_from_motion;
            # verify.py will attach turn_motion_mismatch, skipping organizer steps.
            turn = Turn(id="", type="turn", direction="u_right", source="ai",
                        confidence=0.3, tSec=first_event.endSec, note=None)
            steps.insert(second_index, turn)
            warn("switchback_turn", "No turn was reported between stair flights. A right U-turn was added; review it.", turn)

    # Drop destination sign notes for the entire final walk group, including a
    # sign attached to an earlier walk that will merge into the last one.
    last_walk_index = next((i for i in range(len(steps) - 1, -1, -1)
                            if isinstance(steps[i], Walk)), None)
    destination_walks: set[int] = set()
    if last_walk_index is not None:
        for step in reversed(steps[:last_walk_index + 1]):
            if not isinstance(step, Walk):
                break
            destination_walks.add(id(step))
    for index, event in enumerate(events):
        if event.type not in {"sign", "door"} or (index == 0 and entrance):
            continue
        if event.confidence >= 0.8 and event.note and walks:
            nearest, _ = min(walks, key=lambda pair: max(
                pair[1].startSec - event.endSec, event.startSec - pair[1].endSec, 0,
            ))
            if event.type != "sign" or id(nearest) not in destination_walks:
                _note(nearest, event.note)

    merged: list[Step] = []
    for step in steps:
        if isinstance(step, Walk) and merged and isinstance(merged[-1], Walk):
            previous = merged[-1]
            previous.lengthM += step.lengthM
            known = [value for value in (previous.confidence, step.confidence) if value is not None]
            previous.confidence = min(known, default=None)
            _note(previous, step.note or "")
        else:
            merged.append(step)
    for step in merged:
        if isinstance(step, Walk):
            step.lengthM = round(max(0.5, step.lengthM), 6)
    # A reported final door supplies provenance, but never overrides destination.
    final = events[-1] if events and events[-1].type == "door" and events[-1] is not entrance else None
    final = final or room_turn
    merged.append(Door(**_base(final, time=events[-1].endSec if events else 0),
                       type="door", label=destination))
    for index, step in enumerate(merged, 1):
        step.id = f"s{index}"
        # Deduplicate complete fragments before truncating, including standalone
        # notes. Truncating earlier would lose fragments needed by later merges.
        _note(step, "")
        step.note = _cap_note(step.note)
    return merged, [Check(id=check_id, level="warn", message=message,
                          stepId=step.id if step else None)
                    for check_id, message, step in pending]
