import pytest

from models import Check, Door, Elevator, Stairs, Turn, Walk
from pipeline.verify import verify

BASE = dict(source="ai", confidence=0.9, tSec=0, note=None)


def checked(*steps, start="1", dest="1", duration=None, warnings=()):
    return verify([Door(**BASE, id="entrance", type="door", label="Main entrance"), *steps,
                   Door(**BASE, id="exit", type="door", label="Room 113")],
                  start_floor=start, destination_floor=dest, video_sec=duration, assemble_warnings=warnings)


@pytest.mark.parametrize(("kind", "value", "triggered"), [
    ("leg_length_range", 0.49, True), ("leg_length_range", 0.5, False),
    ("long_walk", 80, False), ("long_walk", 80.01, True),
])
def test_walk_checks(kind, value, triggered):
    checks = checked(Walk(**BASE, id="walk", type="walk", lengthM=value))
    issues = [c for c in checks if c.id == kind and c.level != "pass"]
    assert bool(issues) == triggered
    if issues:
        assert issues[0].stepId == "walk"
        assert issues[0].level == ("fail" if kind == "leg_length_range" else "warn")


@pytest.mark.parametrize(("target", "fails"), [("1", True), ("2", False)])
def test_elevator_floor(target, fails):
    checks = checked(Elevator(**BASE, id="lift", type="elevator", toFloor=target), dest=target)
    assert any(c.id == "elevator_floor" and c.level == "fail" for c in checks) == fails


def test_floor_tracking_uses_explicit_stair_floor_then_elevator():
    stair = Stairs(**BASE, id="stairs", type="stairs", direction="up", riseM=1.8, runM=2.88, toFloor="2")
    lift = Elevator(**BASE, id="lift", type="elevator", toFloor="2")
    checks = checked(stair, lift, dest="2")
    assert any(c.id == "elevator_floor" for c in checks)
    assert not any(c.id == "ends_on_destination_floor" for c in checks)
    lift.toFloor = "3"
    assert not any(c.id == "elevator_floor" for c in checked(stair, lift, dest="3"))
    stair.toFloor = None
    assert any(c.id == "ends_on_destination_floor" for c in checked(stair, dest="2"))
    assert not any(c.id == "ends_on_destination_floor" for c in checked(stair, dest="1"))


@pytest.mark.parametrize(("rise", "warns"), [(0.99, True), (1, False), (4.5, False), (4.51, True)])
def test_stair_rise(rise, warns):
    stairs = Stairs(**BASE, id="stairs", type="stairs", direction="up", riseM=rise, runM=2.88, toFloor="1")
    assert any(c.id == "stair_rise" for c in checked(stairs)) == warns


@pytest.mark.parametrize(("length", "duration", "warns"), [
    (3.99, 10, True), (4, 10, False), (15, 10, False), (15.01, 10, True), (1, None, False),
])
def test_total_length(length, duration, warns):
    assert any(c.id == "total_length" for c in checked(
        Walk(**BASE, id="walk", type="walk", lengthM=length), duration=duration,
    )) == warns


@pytest.mark.parametrize(("walk_length", "run", "warns"), [
    (1, 2.99, True), (1, 3, False), (10, 5, False), (10, 5.01, True),
])
def test_total_length_counts_stair_runs_and_names_walks_and_stairs(walk_length, run, warns):
    checks = checked(Walk(**BASE, id="walk", type="walk", lengthM=walk_length),
                     Stairs(**BASE, id="stairs", type="stairs", direction="up",
                            riseM=1.8, runM=run, toFloor=None), duration=10)
    issues = [c for c in checks if c.id == "total_length"]
    assert bool(issues) == warns
    if issues:
        assert "walks and stairs" in issues[0].message
        assert f"{walk_length + run:g} m" in issues[0].message


@pytest.mark.parametrize(("confidence", "source", "warns"), [
    (0.59, "ai", True), (0.6, "ai", False), (None, "ai", False), (0.1, "organizer", False),
])
def test_low_confidence(confidence, source, warns):
    turn = Turn(**(BASE | dict(source=source, confidence=confidence)), id="turn", type="turn", direction="left")
    issues = [c for c in checked(turn) if c.id == "low_confidence"]
    assert bool(issues) == warns
    if issues:
        assert issues[0].stepId == "turn" and "turn" in issues[0].message


def test_only_editable_problems_can_fail_and_assembly_warnings_are_kept():
    warning = Check(id="stair_floors", level="warn", message="Review floors.", stepId=None)
    steps = [Walk(**BASE, id="short", type="walk", lengthM=0.2),
             Walk(**BASE, id="long", type="walk", lengthM=90),
             Stairs(**BASE, id="stairs", type="stairs", direction="up", riseM=9, runM=10, toFloor=None),
             Elevator(**BASE, id="lift", type="elevator", toFloor="1")]
    checks = checked(*steps, dest="2", duration=1, warnings=[warning])
    assert {c.id for c in checks if c.level == "fail"} == {"leg_length_range", "elevator_floor"}
    assert checks[-1] == warning


def test_stale_step_warnings_drop_and_motion_hooks_skip_organizer():
    step = Turn(**(BASE | dict(source="organizer")), id="turn", type="turn", direction="left")
    warnings = [Check(id=kind, level="warn", message="Review.", stepId="turn")
                for kind in ("turn_motion_mismatch", "turn_from_motion", "low_confidence")]
    warnings.append(Check(id="switchback_turn", level="warn", message="Review.", stepId="deleted"))
    assert all(c.level == "pass" for c in checked(step, warnings=warnings))
