"""Checks applied to edits in the fixture server."""

from models import Check, Step, Walk


def refresh_mock_checks(steps: list[Step], previous: list[Check]) -> list[Check]:
    ai_steps = {step.id for step in steps if step.source == "ai"}
    retained = [
        check for check in previous
        if check.id != "leg_length_range" and (check.stepId is None or check.stepId in ai_steps)
    ]
    short_walks = [
        Check(
            id="leg_length_range", level="fail", stepId=step.id,
            message=f"This walk is {step.lengthM:g} m, shorter than 0.5 m. Delete it to clear this check.",
        )
        for step in steps if isinstance(step, Walk) and step.lengthM < 0.5
    ]
    return retained + (short_walks or [
        Check(
            id="leg_length_range", level="pass",
            message="No walk is shorter than 0.5 m.", stepId=None,
        )
    ])
