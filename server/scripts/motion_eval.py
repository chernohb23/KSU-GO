"""Evaluate four local campus videos against saved timelines, without API calls.

Run from server/: python -B -m scripts.motion_eval --video-dir /path/to/videos
Supply --u-turn-take1 and --u-turn-take2 from human ground truth, never Gemini.
Unknown sides remain in the ten-turn denominator and cannot establish a pass.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from dataclasses import asdict
from pathlib import Path
from time import perf_counter

from pipeline.motion import (
    DEGREES_PER_PIXEL, TURN_EVENT_TYPES, MotionError, detect_candidates,
    measure_turn, measure_video, oversized_right_angle,
)

RECORDINGS = Path(__file__).resolve().parents[1] / "tests" / "recordings"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-dir", type=Path, required=True)
    parser.add_argument("--recordings-dir", type=Path, default=RECORDINGS)
    parser.add_argument("--u-turn-take1", choices=("left", "right"))
    parser.add_argument("--u-turn-take2", choices=("left", "right"))
    parser.add_argument("--json-output", type=Path, help="Optional local report including measured shifts")
    args = parser.parse_args(argv)
    started = perf_counter()
    turns: list[dict] = []
    videos: list[dict] = []
    print(f"Shared calibration: {DEGREES_PER_PIXEL:g} degrees/pixel; positive=right, negative=left")
    print("video | turn (midpoint s) | truth | measured degrees | side correct? | >=150 size warning")
    try:
        for route, take in ((1, 1), (1, 2), (2, 1), (2, 2)):
            label = f"route{route}-take{take}"
            raw = json.loads((args.recordings_dir / f"{label}-1080p-2fps.json").read_text(encoding="utf-8"))
            events = raw["events"]
            turn_events = [event for event in events if event["type"] in TURN_EVENT_TYPES]
            # Independent route truth from test_timeline.py, with the missing
            # U-turn sides supplied only by the human running this evaluator.
            u_side = args.u_turn_take1 if take == 1 else args.u_turn_take2
            truth = ["right", u_side, "right", "left"] if route == 1 else ["right"]
            expected_kinds = ["turn_right", "u_turn", "turn_right", "turn_left"] if route == 1 else ["turn_right"]
            kinds = ["u_turn" if event["type"].startswith("u_turn_") else event["type"] for event in turn_events]
            if kinds != expected_kinds:
                raise ValueError(f"{label}: recording does not align with the independent route truth")
            video_started = perf_counter()
            trace = measure_video(args.video_dir / f"route{route}_{take}.mp4")
            for index, (event, side) in enumerate(zip(turn_events, truth, strict=True), 1):
                measured = measure_turn(trace, event["startSec"], event["endSec"])
                reported = event["type"].removeprefix("turn_")
                correct = measured.side == side if side is not None else None
                size_warn = oversized_right_angle(reported, measured)
                row = dict(video=label, turn=index, event_type=event["type"],
                           truth=side, measured_side=measured.side, **asdict(measured),
                           side_correct=correct, size_warning=size_warn)
                turns.append(row)
                status = "unknown" if correct is None else "yes" if correct else "NO"
                print(f"{label} | {index}: {event['type']} ({measured.midpoint_sec:g}) | "
                      f"{side or 'UNKNOWN'} | {measured.degrees:+.2f} | {status} | {'yes' if size_warn else 'no'}")
            excluded = [(event["startSec"], event["endSec"]) for event in events
                        if event["type"] in TURN_EVENT_TYPES or event["type"] == "pan"]
            candidates = detect_candidates(trace, excluded_intervals=excluded)
            # The complete recordings align with all true turns above; any
            # additional candidate is therefore a false insertion in this set.
            videos.append(dict(video=label, seconds=perf_counter() - video_started,
                               false_insertions=len(candidates), candidates=[asdict(c) for c in candidates],
                               motion=asdict(trace)))
    except (OSError, ValueError, KeyError, MotionError) as error:
        print(f"FAIL: evaluation could not finish ({error}).")
        return 1

    print("\nvideo | false unreported turns | processing seconds")
    for video in videos:
        print(f"{video['video']} | {video['false_insertions']} | {video['seconds']:.2f}")
        for candidate in video["candidates"]:
            print(f"  candidate midpoint={candidate['midpoint_sec']:.1f}s degrees={candidate['degrees']:+.2f}")
    correct_count = sum(row["side_correct"] is True for row in turns)
    unknown_count = sum(row["side_correct"] is None for row in turns)
    passed = correct_count >= 9 and all(video["false_insertions"] <= 1 for video in videos)
    elapsed = perf_counter() - started
    result = "PASS" if passed else "FAIL"
    print(f"\n{result}: {correct_count}/10 confirmed correct sides; {unknown_count} unknown; "
          "required >=9/10 and <=1 false insertion on every video.")
    if unknown_count:
        print("Missing human U-turn sides prevent a complete score; unknown turns were not counted as correct.")
    print(f"Total evaluation time: {elapsed:.2f}s")
    if args.json_output:
        args.json_output.write_text(json.dumps(dict(
            result=result, correct=correct_count, total=10, unknown=unknown_count,
            seconds=elapsed, turns=turns, videos=videos,
        ), indent=2) + "\n", encoding="utf-8")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
