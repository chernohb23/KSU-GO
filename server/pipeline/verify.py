"""Plain-code checks for drafts and organizer edits. No I/O."""

from __future__ import annotations

from collections.abc import Sequence

from models import Check, Elevator, Stairs, Step, Turn, Walk
from pipeline.motion import SIDE_DEAD_ZONE_DEGREES, SavedMotion, magnitude_at_least, oversized_right_angle


def verify(
    steps: Sequence[Step], *, start_floor: str, destination_floor: str,
    video_sec: float | None = None, assemble_warnings: Sequence[Check] = (),
    motion: SavedMotion | None = None,
) -> list[Check]:
    checks: list[Check] = []

    def add(check_id: str, level: str, message: str, step_id: str | None = None) -> None:
        checks.append(Check(id=check_id, level=level, message=message, stepId=step_id))

    floor = start_floor
    length = 0.0
    for step in steps:
        if isinstance(step, Walk):
            length += step.lengthM
            if step.lengthM < 0.5:
                add("leg_length_range", "fail", f"This walk is {step.lengthM:g} m, shorter than 0.5 m. Delete it to clear this check.", step.id)
            if step.lengthM > 80:
                add("long_walk", "warn", f"This walk is {step.lengthM:g} m, longer than 80 m. Review the route.", step.id)
        elif isinstance(step, Elevator):
            if step.toFloor == floor:
                add("elevator_floor", "fail", f"This elevator already starts on floor {floor}. Change its floor or delete it.", step.id)
            floor = step.toFloor
        elif isinstance(step, Stairs):
            length += step.runM
            if not 1.0 <= step.riseM <= 4.5:
                add("stair_rise", "warn", f"This flight rises {step.riseM:g} m, outside 1.0–4.5 m. Review the stairs.", step.id)
            if step.toFloor is not None:
                floor = step.toFloor
        if step.source == "ai" and step.confidence is not None and step.confidence < 0.6:
            add("low_confidence", "warn", f"The AI's confidence in this step ({step.id}) is {step.confidence:g}, under 0.6.", step.id)
        if isinstance(step, Turn) and step.source == "ai" and motion is not None:
            measured = motion.measure_step(step.id)
            if measured is not None and magnitude_at_least(measured.degrees, SIDE_DEAD_ZONE_DEGREES):
                if step.direction.removeprefix("u_") != measured.side:
                    add("turn_motion_mismatch", "warn", f"The video turns {measured.side} here.", step.id)
                elif oversized_right_angle(step.direction, measured):
                    add("turn_motion_mismatch", "warn",
                        "The video turns at least 150 degrees here; review this quarter-turn.", step.id)

    if not any(check.id == "leg_length_range" for check in checks):
        add("leg_length_range", "pass", "No walk is shorter than 0.5 m.")
    if floor != destination_floor:
        add("ends_on_destination_floor", "warn", f"The route ends on floor {floor}, but the destination is on floor {destination_floor}.")
    if video_sec is not None and video_sec > 0 and not 0.4 * video_sec <= length <= 1.5 * video_sec:
        add("total_length", "warn", f"The walks and stairs total {length:g} m for a {video_sec:g} s video, outside 0.4–1.5 m/s. Review the walk lengths and stair runs.")
    by_id = {step.id: step for step in steps}
    for warning in assemble_warnings:
        if warning.stepId is not None and warning.stepId not in by_id:
            continue
        if (warning.id in {"turn_motion_mismatch", "turn_from_motion", "low_confidence"}
                and warning.stepId in by_id and by_id[warning.stepId].source == "organizer"):
            continue
        checks.append(warning.model_copy(update={"level": "warn"}))
    return checks
