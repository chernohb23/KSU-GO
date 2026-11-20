"""Bake the prepared stage draft for Mathematics Room 113 from the recorded route2 run.

The AI timeline (`tests/recordings/route2-take1-1080p-2fps.json`) and the camera
motion measured from the same video (`route2-take1-motion.json`) go through the
same assemble and verify code as a live upload. No paid call is made. The draft
is the AI's output as it is: nothing is corrected or planted.

    python -m scripts.bake_stage_draft            # writes the fixture
    python -m scripts.bake_stage_draft --check    # exits 1 if the fixture is stale
"""

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from models import Route
from pipeline.assemble import assemble
from pipeline.motion import DEGREES_PER_PIXEL, MotionTrace, SavedMotion, Shift
from pipeline.timeline import parse_timeline
from pipeline.verify import verify

SERVER_DIR = Path(__file__).resolve().parents[1]
RECORDINGS = SERVER_DIR / "tests" / "recordings"
FIXTURE = SERVER_DIR.parent / "shared" / "fixtures" / "routes" / "room-113.draft.json"

STAGE_DRAFT_ID = "route-math-113-draft"
BUILDING_ID = "b-mathematics"
DESTINATION = "Room 113"
CREATED_AT = "2026-11-20T09:00:00-05:00"


def build_stage_draft() -> Route:
    recording = json.loads((RECORDINGS / "route2-take1-motion.json").read_text(encoding="utf-8"))
    saved = SavedMotion.model_validate(recording["motion"])
    # The fixed-rate trace the motion check measured, rebuilt from its saved increments.
    trace = MotionTrace(
        tuple(Shift((i + 1) / 10, -d / DEGREES_PER_PIXEL, 1.0) for i, d in enumerate(saved.rotation_per_frame)),
        len(saved.rotation_per_frame) / 10, 160, 284,
    )
    duration = recording["duration_sec"]
    start, end = recording["start_floor"], recording["destination_floor"]
    timeline = parse_timeline((RECORDINGS / recording["timeline_recording"]).read_text(encoding="utf-8"), duration)
    midpoints: dict[str, float] = {}
    steps, warnings = assemble(timeline, destination=DESTINATION, start_floor=start, destination_floor=end,
                               motion=trace, turn_midpoints=midpoints)
    checks = verify(steps, start_floor=start, destination_floor=end, video_sec=duration,
                    assemble_warnings=warnings, motion=saved)
    return Route.model_validate({
        "id": STAGE_DRAFT_ID, "version": 1, "status": "draft", "progress": None, "error": None,
        "buildingId": BUILDING_ID, "destination": DESTINATION, "startFloor": start, "destinationFloor": end,
        "corridorWidthM": 2.0, "ceilingHeightM": 2.7,
        "steps": [step.model_dump(mode="json") for step in steps],
        "checks": [check.model_dump(mode="json") for check in checks],
        # Measured cost and processing time for this run come from AI-6, not this replay.
        "stats": None,
        "createdAt": CREATED_AT, "confirmedAt": None,
    }, strict=False)


def render(route: Route) -> str:
    return json.dumps(route.model_dump(mode="json"), indent=2) + "\n"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the fixture differs from a fresh bake")
    args = parser.parse_args(argv)
    text = render(build_stage_draft())
    if args.check:
        return 0 if FIXTURE.read_text(encoding="utf-8") == text else 1
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"Wrote {FIXTURE.relative_to(SERVER_DIR.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
