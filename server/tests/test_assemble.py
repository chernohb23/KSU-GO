import json
from pathlib import Path

import pytest

from pipeline.assemble import assemble
from pipeline.timeline import Timeline, TimelineEvent, parse_timeline
from pipeline.verify import verify


def event(kind, start, end, *, confidence=0.9, note=""):
    return TimelineEvent(type=kind, startSec=start, endSec=end, confidence=confidence, note=note)


def build(*events, start="1", dest="2"):
    timeline = Timeline(startFloor="untrusted", endRoom="wrong", motionLog=["forward"], events=list(events))
    return assemble(timeline, destination="Room 215", start_floor=start, destination_floor=dest)


def test_synthetic_doors_ids_and_provenance_are_stable_and_input_is_unchanged():
    timeline = Timeline(startFloor="99", endRoom="incorrect", motionLog=["forward"],
                        events=[event("walk", 0, 5, note="hallway")])
    before = timeline.model_dump_json()
    first = assemble(timeline, destination="Room 215", start_floor="1", destination_floor="1")
    second = assemble(timeline, destination="Room 215", start_floor="1", destination_floor="1")
    steps, _ = first
    assert first == second
    assert timeline.model_dump_json() == before
    assert [(s.type, getattr(s, "label", None)) for s in (steps[0], steps[-1])] == [
        ("door", "Main entrance"), ("door", "Room 215"),
    ]
    assert [s.id for s in steps] == ["s1", "s2", "s3"]
    assert all(s.source == "ai" for s in steps)
    assert steps[1].confidence == 0.9 and steps[1].tSec == 0


def test_reported_entrance_and_destination_doors():
    steps, _ = build(event("door", 0, 1, note="Glass entrance", confidence=0.95),
                     event("walk", 1, 3), event("door", 3, 4, note="wrong room"))
    assert steps[0].label == "Main entrance"
    assert steps[0].note == "Glass entrance"
    assert steps[0].confidence == 0.95
    assert steps[-1].label == "Room 215" and steps[-1].tSec == 3
    assert sum(s.type == "door" for s in steps) == 2


@pytest.mark.parametrize("side", ["left", "right"])
def test_turn_into_room_becomes_turn_and_final_door(side):
    steps, _ = build(event("walk", 0, 3), event("turn_into_room", 3, 4, note=f"turn {side} into room"))
    assert steps[-2].type == "turn" and steps[-2].direction == side
    assert steps[-2].tSec == 3 and steps[-2].confidence == 0.9
    assert steps[-1].type == "door" and steps[-1].label == "Room 215"


def test_unclear_room_turn_has_review_warning():
    steps, warnings = build(event("turn_into_room", 0, 1))
    assert steps[1].direction == "right"
    assert any(c.id == "room_turn_side" and c.stepId == steps[1].id for c in warnings)


def test_room_turn_immediately_precedes_final_door_even_with_trailing_gap():
    steps, _ = build(event("turn_into_room", 0, 2, note="left into room"),
                     event("sign", 2, 3, note="Room 215"), event("walk", 3, 3.2))
    assert [s.type for s in steps] == ["door", "turn", "door"]
    assert steps[-1].tSec == 0 and steps[-1].confidence == 0.9


@pytest.mark.parametrize(("turns", "expected", "warns"), [
    (["turn_left"], "u_left", True), (["turn_right"], "u_right", True),
    ([], "u_right", True), (["turn_left", "turn_left"], "u_left", False),
    (["turn_right", "turn_right"], "u_right", False),
    (["u_turn_left"], "u_left", False), (["u_turn_right"], "u_right", False),
])
def test_switchback_rules(turns, expected, warns):
    events = [event("stairs_up", 0, 4)]
    events.extend(event(kind, 4 + i, 5 + i) for i, kind in enumerate(turns))
    events.append(event("stairs_up", 7, 11))
    steps, warnings = build(*events)
    actual = [s for s in steps if s.type == "turn"]
    assert len(actual) == 1 and actual[0].direction == expected
    assert bool(warnings) == warns
    assert all(c.level == "warn" and c.stepId == actual[0].id for c in warnings)


def test_switchback_boundary_and_opposite_turns_are_not_rewritten():
    steps, _ = build(event("stairs_up", 0, 4), event("stairs_up", 12, 16))
    assert not any(s.type == "turn" for s in steps)
    steps, _ = build(event("stairs_up", 0, 4), event("turn_left", 4, 5),
                     event("turn_right", 5, 6), event("stairs_up", 6, 10))
    assert [s.direction for s in steps if s.type == "turn"] == ["left", "right"]


def test_tiny_walk_merges_with_adjacent_walk_or_is_raised():
    steps, _ = build(event("walk", 0, 0.2), event("walk", 0.2, 3),
                     event("turn_right", 3, 4), event("walk", 4, 4.2))
    walks = [s for s in steps if s.type == "walk"]
    assert [s.lengthM for s in walks] == [2.1, 0.5]


def test_pan_dropped_and_overlapping_sign_pan_union_excluded_from_walk():
    steps, _ = build(event("walk", 0, 10), event("pan", 2, 5), event("sign", 4, 6))
    assert [s.type for s in steps] == ["door", "walk", "door"]
    assert steps[1].lengthM == 4.2  # six walking seconds; overlap subtracted once


def test_disjoint_sign_pan_time_is_not_added_when_walks_merge():
    steps, _ = build(event("walk", 0, 2), event("pan", 2, 5),
                     event("sign", 5, 7), event("walk", 7, 10))
    assert steps[1].lengthM == 3.5


def test_sign_notes_only_at_threshold_and_on_nearest_walk_middle_doors_are_notes():
    steps, _ = build(event("walk", 0, 2), event("sign", 2, 2.2, confidence=0.79, note="ignore me"),
                     event("sign", 2.2, 3, confidence=0.8, note="Lobby sign"),
                     event("turn_right", 3, 4), event("walk", 4, 8),
                     event("door", 8, 9, note="hallway doorway"),
                     event("sign", 9, 10, confidence=0.8, note="Room 215 sign"))
    walks = [s for s in steps if s.type == "walk"]
    assert walks[0].note == "Lobby sign"
    assert walks[1].note == "hallway doorway"
    assert sum(s.type == "door" for s in steps) == 2


def test_destination_sign_dropped_from_walks_that_will_merge():
    steps, _ = build(event("walk", 0, 2), event("sign", 2, 3, note="Professor Name, Room 215"),
                     event("walk", 3, 5, note="hallway"))
    assert [s.type for s in steps] == ["door", "walk", "door"]
    assert steps[1].note == "hallway"
    assert "Professor" not in str([s.note for s in steps])


@pytest.mark.parametrize("confidence", [0.79, 0.8])
def test_entrance_description_is_only_a_note_at_confidence_threshold(confidence):
    steps, _ = build(event("door", 0, 1, confidence=confidence, note="Glass entrance"))
    assert steps[0].label == "Main entrance"
    assert steps[0].note == ("Glass entrance" if confidence >= 0.8 else None)


def test_all_step_notes_are_capped_at_word_boundaries():
    long_note = "east " * 16 + "door"
    kinds = ["door", "walk", "turn_right", "stairs_up", "door"]
    steps, _ = build(*(event(kind, i, i + 1, note=long_note) for i, kind in enumerate(kinds)))
    assert {s.type for s in steps} == {"door", "walk", "turn", "stairs"}
    assert all(s.note == " ".join(["east"] * 16) + "…" for s in steps)
    assert all(len(s.note) == 80 for s in steps)


def test_merged_notes_deduplicate_complete_fragments_before_capping():
    steps, _ = build(event("walk", 0, 1, note="north hall; hall"),
                     event("walk", 1, 2, note="hall; drinking fountain"))
    assert steps[1].note == "north hall; hall; drinking fountain"
    repeated = "east " * 16 + "door"
    steps, _ = build(event("walk", 0, 1, note=repeated), event("walk", 1, 2, note=repeated))
    assert steps[1].note == " ".join(["east"] * 16) + "…"


@pytest.mark.parametrize(("note", "expected"), [
    ("short note", "short note"), ("x" * 80, "x" * 80),
    ("x" * 81, "…"), ("east " * 15 + "staircase", " ".join(["east"] * 15) + "…"),
])
def test_note_cap_preserves_short_notes_and_never_splits_words(note, expected):
    steps, _ = build(event("walk", 0, 1, note=note))
    assert steps[1].note == expected


def parsed_steps(events, duration=5, *, cached=False):
    timeline = parse_timeline(json.dumps(dict(startFloor="1", endRoom=None,
                                              motionLog=["forward"],
                                              events=[e.model_dump() for e in events])), duration)
    if cached:
        timeline = parse_timeline(timeline.model_dump_json(), duration)
    return assemble(timeline, destination="Room 215", start_floor="1", destination_floor="1")[0]


@pytest.mark.parametrize("cached", [False, True])
def test_gap_walks_have_unknown_confidence_including_cached_timelines(cached):
    steps = parsed_steps([event("turn_right", 1, 2), event("door", 3, 4)], cached=cached)
    walks = [s for s in steps if s.type == "walk"]
    assert walks and all(s.confidence is None and s.source == "ai" for s in walks)
    checks = verify(steps, start_floor="1", destination_floor="1")
    assert not any(c.id == "low_confidence" for c in checks)


@pytest.mark.parametrize("events", [
    [event("walk", 1, 3, confidence=0.91)],  # leading and trailing gaps
    [event("walk", 0, 3, confidence=0.91)],  # trailing gap
    [event("walk", 1, 5, confidence=0.91)],  # leading gap
    [event("walk", 0, 1, confidence=0.95), event("walk", 3, 5, confidence=0.91)],
])
def test_gap_merges_keep_real_walk_confidence(events):
    steps = parsed_steps(events)
    walks = [s for s in steps if s.type == "walk"]
    assert len(walks) == 1
    assert walks[0].confidence == 0.91 and walks[0].tSec == 0


@pytest.mark.parametrize("confidence", [0.0, 0.59])
def test_real_low_confidence_walks_still_warn_when_merged_with_gaps(confidence):
    steps = parsed_steps([event("walk", 1, 3, confidence=confidence)])
    walk = next(s for s in steps if s.type == "walk")
    assert walk.confidence == confidence
    checks = verify(steps, start_floor="1", destination_floor="1")
    assert any(c.id == "low_confidence" and c.stepId == walk.id for c in checks)


def test_low_confidence_landmark_text_is_not_used_as_a_note():
    steps, _ = build(event("walk", 0, 2, confidence=0.79, note="unreadable landmark"))
    assert steps[1].note is None


@pytest.mark.parametrize(("start", "dest", "warns"), [("1", "2", False), ("100", "200", True), ("1", "1", True), ("G", "2", True)])
def test_two_flights_floor_height(start, dest, warns):
    steps, warnings = build(event("stairs_up", 0, 4), event("u_turn_left", 4, 5),
                            event("stairs_up", 5, 9), start=start, dest=dest)
    stairs = [s for s in steps if s.type == "stairs"]
    assert [(s.riseM, s.runM) for s in stairs] == [(1.8, 2.88)] * 2
    assert [s.toFloor for s in stairs] == [None, dest]
    assert bool(warnings) == warns
    if start == "100":
        assert any("/100" in c.message for c in warnings)


@pytest.mark.parametrize(("start", "dest", "kind", "expected"), [
    ("1", "3", "stairs_up", [None, "2", None, "3"]),
    ("3", "1", "stairs_down", [None, "2", None, "1"]),
    ("100", "300", "stairs_up", [None, "200", None, "300"]),
])
def test_intermediate_floor_labels(start, dest, kind, expected):
    steps, _ = build(*(event(kind, i * 12, i * 12 + 4) for i in range(4)), start=start, dest=dest)
    assert [s.toFloor for s in steps if s.type == "stairs"] == expected


@pytest.mark.parametrize("events", [[], [event("stairs_down", 0, 4)],
                                     [event("stairs_up", 0, 4), event("stairs_down", 4, 8)]])
def test_incompatible_stairs_warn(events):
    steps, warnings = build(*events)
    assert any(c.id == "stair_floors" for c in warnings)
    assert all(s.riseM == 1.8 for s in steps if s.type == "stairs")


def test_absurd_floor_entries_use_safe_fallback():
    steps, warnings = build(event("stairs_up", 0, 4), start="1", dest="9999999999999999999999999")
    assert steps[1].riseM == 1.8
    assert warnings


def test_numeric_but_absurd_height_uses_safe_fallback():
    steps, warnings = build(event("stairs_up", 0, 4), start="1", dest="200")
    assert steps[1].riseM == 1.8 and warnings


@pytest.mark.parametrize(("route", "take", "duration"), [
    (1, 1, 44.26), (1, 2, 43.76), (2, 1, 37.54), (2, 2, 38.25),
])
def test_recorded_validate_assemble_verify(route, take, duration):
    recording = Path(__file__).parent / "recordings" / f"route{route}-take{take}-1080p-2fps.json"
    timeline = parse_timeline(recording.read_text(), duration)
    destination, floor = ("Room 215", "2") if route == 1 else ("Room 113", "1")
    steps, warnings = assemble(timeline, destination=destination, start_floor="1", destination_floor=floor)
    assert steps[0].type == "door" and steps[-1].type == "door"
    assert steps[0].label == "Main entrance"
    assert steps[-1].label == destination
    sequence = [(s.type, getattr(s, "direction", None), getattr(s, "toFloor", None))
                for s in steps if s.type in {"turn", "stairs"}]
    assert sequence == ([
        ("turn", "right", None), ("stairs", "up", None), ("turn", "u_left", None),
        ("stairs", "up", "2"), ("turn", "right", None), ("turn", "left", None),
    ] if route == 1 else [("turn", "right", None)])
    checks = verify(steps, start_floor="1", destination_floor=floor,
                    video_sec=duration, assemble_warnings=warnings)
    assert not any(c.level == "fail" for c in checks)
    assert not any(c.id in {"low_confidence", "total_length"} for c in checks)
    assert all(s.lengthM >= 0.5 for s in steps if s.type == "walk")
    assert all(s.note is None or len(s.note) <= 80 for s in steps)
    assert not any("Liancheng" in (s.note or "") for s in steps)
    if route == 1 and take == 1:
        distance = sum(s.lengthM if s.type == "walk" else s.runM if s.type == "stairs" else 0
                       for s in steps)
        assert distance == pytest.approx(19.91)
