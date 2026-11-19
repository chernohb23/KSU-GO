"""Camera-motion tests use synthetic frames and numeric recordings, never videos or APIs."""

import io
import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from models import Turn, Walk
from pipeline.assemble import assemble
from pipeline.motion import (
    DEGREES_PER_PIXEL, MotionError, MotionTrace, SavedMotion, Shift, _read_frame,
    detect_candidates, measure_turn, measure_video, rotation_between, save_motion,
)
from pipeline.timeline import Timeline, TimelineEvent, parse_timeline
from pipeline.verify import verify

RECORDINGS = Path(__file__).parent / "recordings"


def rotation_trace(*, degrees=90.0, start=5.0, end=6.0, duration=12.0):
    shifts = []
    for index in range(1, round(duration * 10) + 1):
        time = index / 10
        rotation = degrees / ((end - start) * 10) if start < time <= end else 0
        shifts.append(Shift(time, -rotation / DEGREES_PER_PIXEL, 1.0))
    return MotionTrace(tuple(shifts), duration, 160, 284)


def event(kind, start, end, **fields):
    return TimelineEvent(type=kind, startSec=start, endSec=end, confidence=0.9, note="", **fields)


def build(*events, trace=None):
    timeline = Timeline(startFloor="1", endRoom=None, motionLog=["forward"], events=list(events))
    midpoints = {}
    steps, warnings = assemble(timeline, destination="Room 215", start_floor="1", destination_floor="1",
                               motion=trace, turn_midpoints=midpoints)
    return steps, warnings, save_motion(trace, midpoints) if trace else None


@pytest.mark.parametrize("dx", [-4, 4])
def test_synthetic_shift_sign_and_scale(dx):
    frame = np.random.default_rng(7).random((284, 160), dtype=np.float32)
    window = cv2.createHanningWindow((160, 284), cv2.CV_32F)
    (measured, _), response = cv2.phaseCorrelate(frame.copy(), np.roll(frame, dx, axis=1), window)
    assert measured == pytest.approx(dx, abs=0.05)
    assert response > 0.9
    trace = MotionTrace((Shift(0.1, measured, response),), 0.1, 160, 284)
    assert rotation_between(trace, 0, 0.1) == pytest.approx(-dx * DEGREES_PER_PIXEL, abs=0.02)


def test_fractional_pairs_and_saved_midpoint_reproduce_measurement():
    trace = rotation_trace(degrees=-90)
    saved = save_motion(trace, {"turn": 5.75})
    saved = SavedMotion.model_validate_json(saved.model_dump_json())
    assert saved.measure_step("turn").degrees == pytest.approx(measure_turn(trace, 5, 6.5).degrees)
    assert saved.measure_step("turn").midpoint_sec == 5.75
    assert sum(saved.rotation_per_second) == pytest.approx(-90)
    assert saved.measure_step("unknown") is None
    partial = MotionTrace((Shift(0.1, 10, 1), Shift(0.2, -5, 1)), 0.2, 160, 284)
    assert rotation_between(partial, 0.05, 0.15) == pytest.approx(-2.5 * DEGREES_PER_PIXEL)


@pytest.mark.parametrize(("direction", "degrees", "warns"), [
    ("right", -19.99, False), ("right", -20, True), ("left", 19.99, False),
    ("left", 20, True), ("right", 0, False), ("right", 149.99, False),
    ("right", 150, True), ("left", -150, True),
    ("u_right", 180, False), ("u_left", -180, False), ("u_left", 180, True),
])
def test_side_dead_zone_and_conservative_size_rule(direction, degrees, warns):
    trace = rotation_trace(degrees=degrees, start=4, end=8)
    saved = save_motion(trace, {"turn": 6.0})
    # Editable tSec deliberately differs from the saved midpoint.
    turn = Turn(id="turn", type="turn", direction=direction, source="ai", confidence=0.9, tSec=0, note=None)
    checks = verify([turn], start_floor="1", destination_floor="1", motion=saved)
    mismatch = [c for c in checks if c.id == "turn_motion_mismatch"]
    assert bool(mismatch) == warns
    assert all(c.level == "warn" and c.stepId == "turn" for c in mismatch)
    turn.source = "organizer"
    assert not any(c.id == "turn_motion_mismatch" for c in verify(
        [turn], start_floor="1", destination_floor="1", motion=saved))


def test_missing_turn_splits_walk_and_retains_provenance_and_length():
    trace = rotation_trace(degrees=-90)
    steps, warnings, saved = build(event("walk", 0, 12), trace=trace)
    assert [step.type for step in steps] == ["door", "walk", "turn", "walk", "door"]
    turn = steps[2]
    assert turn.direction == "left" and turn.confidence == 0.3 and turn.source == "ai"
    assert sum(s.lengthM for s in steps if isinstance(s, Walk)) == pytest.approx(8.4)
    assert steps[1].lengthM == pytest.approx(turn.tSec * 0.7)
    assert steps[3].tSec == turn.tSec
    assert saved.turn_midpoints == {turn.id: turn.tSec}
    assert [(w.id, w.stepId, w.message) for w in warnings] == [(
        "turn_from_motion", turn.id,
        "The video turns here but the AI did not report it. Keep or delete.",
    )]


@pytest.mark.parametrize("kind", ["pan", "turn_right", "turn_left", "u_turn_left", "turn_into_room"])
def test_reported_turns_and_pans_exclude_candidates(kind):
    trace = rotation_trace()
    assert len(detect_candidates(trace, excluded_intervals=[])) == 1
    assert detect_candidates(trace, excluded_intervals=[(4, 7)]) == []
    steps, warnings, _ = build(event("walk", 0, 4), event(kind, 4, 7), event("walk", 7, 12), trace=trace)
    assert not any(w.id == "turn_from_motion" for w in warnings)
    if kind == "pan":
        assert not any(isinstance(s, Turn) for s in steps)


@pytest.mark.parametrize("degrees,expected", [(-90, "u_left"), (90, "u_right"), (-10, "u_right")])
def test_missing_switchback_uses_motion_side_or_falls_back(degrees, expected):
    trace = rotation_trace(degrees=degrees, duration=11)
    steps, _, saved = build(event("stairs_up", 0, 4), event("stairs_up", 7, 11), trace=trace)
    turn = next(s for s in steps if isinstance(s, Turn))
    assert turn.direction == expected
    assert saved.turn_midpoints[turn.id] == 5.5


def test_consecutive_turns_merged_to_switchback_keep_combined_midpoint():
    steps, _, saved = build(event("stairs_up", 0, 4), event("turn_left", 4, 5),
                            event("turn_left", 5, 7), event("stairs_up", 7, 11),
                            trace=rotation_trace(degrees=-180, duration=11))
    turns = [s for s in steps if isinstance(s, Turn)]
    assert len(turns) == 1 and turns[0].direction == "u_left"
    assert saved.turn_midpoints == {turns[0].id: 5.5}


def test_decoder_uses_upright_frame_dimensions_and_consecutive_unwindowed_frames(monkeypatch, tmp_path):
    frame = np.random.default_rng(7).integers(0, 256, (284, 160), dtype=np.uint8)
    payload = b"".join(b"P5\n160 284\n255\n" + np.roll(frame, i * 4, axis=1).tobytes() for i in range(3))
    commands = []

    class Process:
        def __init__(self, command, **kwargs):
            commands.append(command)
            self.stdout = io.BytesIO(payload)

        def __enter__(self): return self
        def __exit__(self, *args): return False
        def wait(self, **kwargs): return 0
        def poll(self): return 0

    monkeypatch.setattr("pipeline.motion.imageio_ffmpeg.get_ffmpeg_exe", lambda: "ffmpeg")
    monkeypatch.setattr("pipeline.motion.subprocess.Popen", Process)
    video = tmp_path / "synthetic.mov"
    video.write_bytes(b"placeholder; decoder is injected")
    trace = measure_video(video)
    assert (trace.width, trace.height) == (160, 284)
    assert len(trace.shifts) == 2
    assert [s.dx_px for s in trace.shifts] == pytest.approx([4, 4], abs=0.05)
    assert "-noautorotate" not in commands[0]
    assert "fps=10,scale=160:-2,format=gray" in commands[0]
    with pytest.raises(MotionError):
        _read_frame(io.BytesIO(b"P5\n160 2\n255\nshort"))


@pytest.mark.parametrize("route,take", [(1, 1), (1, 2), (2, 1), (2, 2)])
def test_saved_campus_rotations_keep_all_ten_sides_and_no_false_insertions(route, take):
    recording = json.loads((RECORDINGS / f"route{route}-take{take}-motion.json").read_text())
    saved = SavedMotion.model_validate(recording["motion"])
    # Recreate the fixed-rate trace from numeric increments, without a video.
    trace = MotionTrace(tuple(Shift((i + 1) / 10, -d / DEGREES_PER_PIXEL, 1.0)
                              for i, d in enumerate(saved.rotation_per_frame)),
                        len(saved.rotation_per_frame) / 10, 160, 284)
    timeline = parse_timeline((RECORDINGS / recording["timeline_recording"]).read_text(), recording["duration_sec"])
    midpoints = {}
    steps, warnings = assemble(timeline, destination="Room 215" if route == 1 else "Room 113",
                               start_floor=recording["start_floor"], destination_floor=recording["destination_floor"],
                               motion=trace, turn_midpoints=midpoints)
    assert midpoints == saved.turn_midpoints
    assert len(recording["truth"]) == (4 if route == 1 else 1)
    for truth in recording["truth"]:
        assert saved.measure_step(truth["step_id"]).side == truth["side"]
    checks = verify(steps, start_floor=recording["start_floor"], destination_floor=recording["destination_floor"],
                    assemble_warnings=warnings, motion=saved)
    assert not any(c.id in {"turn_motion_mismatch", "turn_from_motion"} for c in checks)
