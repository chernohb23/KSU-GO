"""Replay a saved AI-3 answer through validation, assembly and verification."""

import argparse
from collections.abc import Sequence
from pathlib import Path

from pipeline.assemble import assemble
from pipeline.timeline import parse_timeline
from pipeline.verify import verify


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path)
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--start", required=True)
    parser.add_argument("--dest", required=True)
    args = parser.parse_args(argv)
    timeline = parse_timeline(args.recording.read_text(encoding="utf-8"), args.duration)
    steps, warnings = assemble(timeline, destination=args.destination,
                               start_floor=args.start, destination_floor=args.dest)
    for step in steps:
        fields = step.model_dump(exclude={"id", "type", "source", "note", "confidence", "tSec"})
        detail = " ".join(f"{key}={value}" for key, value in fields.items())
        print(f"{step.id} {step.type} {detail} note={step.note!r} confidence={step.confidence}")
    print("Checks:")
    for check in verify(steps, start_floor=args.start, destination_floor=args.dest,
                        video_sec=args.duration, assemble_warnings=warnings):
        print(f"{check.level} {check.id} stepId={check.stepId}: {check.message}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
