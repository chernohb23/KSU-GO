"""Local camera-motion measurements. No model clients or route mutations.

Positive degrees mean a right turn: the upright image slides left. The scale
is approximate, calibrated once from the phase-1 route1/take1 90-degree turns.
It is shared by every video, not fitted to each turn or timeline answer.
"""

from __future__ import annotations

import math
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Literal

import cv2
import imageio_ffmpeg
import numpy as np

from models import ContractModel

FRAME_WIDTH = 160
FRAME_FPS = 10
DEGREES_PER_PIXEL = 0.206
WINDOW_SECONDS = 4.0
UNREPORTED_TURN_DEGREES = 60.0
OVERSIZED_RIGHT_ANGLE_DEGREES = 150.0
SIDE_DEAD_ZONE_DEGREES = 20.0
TURN_EVENT_TYPES = frozenset({
    "turn_left", "turn_right", "u_turn_left", "u_turn_right", "turn_into_room",
})
Side = Literal["left", "right"]


class MotionError(ValueError):
    """Video frames could not be measured locally."""


@dataclass(frozen=True)
class Shift:
    # The pair spans [end_sec - 1/fps, end_sec]. Response is diagnostic only;
    # no per-video response filtering or replacement of bad pairs is applied.
    end_sec: float
    dx_px: float
    response: float


@dataclass(frozen=True)
class MotionTrace:
    shifts: tuple[Shift, ...]
    duration_sec: float
    width: int
    height: int
    fps: int = FRAME_FPS
    degrees_per_pixel: float = DEGREES_PER_PIXEL


@dataclass(frozen=True)
class TurnMeasurement:
    # Keep this midpoint with a step's saved motion data during later wiring.
    midpoint_sec: float
    degrees: float

    @property
    def side(self) -> Side | None:
        if self.degrees == 0:
            return None
        return "right" if self.degrees > 0 else "left"


class SavedMotion(ContractModel):
    """Private upload data, never part of a public Route.

    Retain the 10 Hz increments as well as the required per-second totals:
    whole-second rounding must not change a check near 20 or 150 degrees.
    Midpoints refer to stable step IDs, independently of editable tSec values.
    """

    rotation_per_second: list[float]
    rotation_per_frame: list[float]
    turn_midpoints: dict[str, float]

    def measure_step(self, step_id: str) -> TurnMeasurement | None:
        midpoint = self.turn_midpoints.get(step_id)
        if midpoint is None:
            return None
        start, end = midpoint - WINDOW_SECONDS / 2, midpoint + WINDOW_SECONDS / 2
        degrees = 0.0
        for index, rotation in enumerate(self.rotation_per_frame):
            pair_end = (index + 1) / FRAME_FPS
            overlap = min(end, pair_end) - max(start, pair_end - 1 / FRAME_FPS)
            if overlap > 0:
                degrees += rotation * min(1.0, overlap * FRAME_FPS)
        return TurnMeasurement(midpoint, degrees)


def _read_frame(stream: BinaryIO) -> np.ndarray | None:
    """Read the PGM frame emitted by ffmpeg, including its upright dimensions."""
    magic = stream.readline()
    if not magic:
        return None
    if magic != b"P5\n":
        raise MotionError("Unexpected grayscale frame format.")
    try:
        width, height = map(int, stream.readline().split())
    except ValueError:
        raise MotionError("Unreadable grayscale frame dimensions.") from None
    if width != FRAME_WIDTH or not 0 < height <= 4096 or stream.readline().strip() != b"255":
        raise MotionError("Unsupported grayscale frame dimensions or depth.")
    data = stream.read(width * height)
    if len(data) != width * height:
        raise MotionError("Incomplete grayscale frame.")
    return np.frombuffer(data, dtype=np.uint8).reshape(height, width)


def measure_video(path: Path) -> MotionTrace:
    """Decode upright at 160 px wide / 10 fps and correlate consecutive frames.

    ffmpeg's default autorotation applies the display matrix before scaling.
    Frames stream through a pipe; no video copies or decoded frames are saved.
    """
    if not path.is_file():
        raise MotionError("Video file does not exist.")
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
        "-nostdin", "-threads", "2", "-i", str(path.resolve()),
        "-map", "0:v:0", "-an", "-sn", "-dn",
        "-vf", f"fps={FRAME_FPS},scale={FRAME_WIDTH}:-2,format=gray",
        "-c:v", "pgm", "-f", "image2pipe", "pipe:1",
    ]
    shifts: list[Shift] = []
    previous = None
    window = None
    count = 0
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as process:
        assert process.stdout is not None
        try:
            while (frame := _read_frame(process.stdout)) is not None:
                current = frame.astype(np.float32)
                if previous is not None:
                    if current.shape != previous.shape:
                        raise MotionError("Video frame dimensions changed.")
                    # phaseCorrelate windows its inputs in place: preserve the
                    # unwindowed current frame for the next consecutive pair.
                    (dx, _dy), response = cv2.phaseCorrelate(previous.copy(), current.copy(), window)
                    if not math.isfinite(dx) or not math.isfinite(response):
                        raise MotionError("Non-finite camera-motion measurement.")
                    shifts.append(Shift(count / FRAME_FPS, dx, response))
                else:
                    height, width = current.shape
                    window = cv2.createHanningWindow((width, height), cv2.CV_32F)
                previous = current
                count += 1
            if process.wait(timeout=30) != 0:
                raise MotionError("Video decoding failed.")
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
    if previous is None or count < 2:
        raise MotionError("Video needs at least two decoded frames.")
    height, width = previous.shape
    return MotionTrace(tuple(shifts), (count - 1) / FRAME_FPS, width, height)


def rotation_between(trace: MotionTrace, start_sec: float, end_sec: float) -> float:
    """Sum signed rotation, proportionally including boundary frame pairs."""
    if not math.isfinite(start_sec) or not math.isfinite(end_sec) or end_sec < start_sec:
        raise ValueError("Motion interval must be finite and ordered.")
    interval = 1 / trace.fps
    pixels = 0.0
    for shift in trace.shifts:
        overlap = min(end_sec, shift.end_sec) - max(start_sec, shift.end_sec - interval)
        if overlap > 0:
            pixels += shift.dx_px * min(1.0, overlap / interval)
    return -pixels * trace.degrees_per_pixel


def measure_turn(trace: MotionTrace, start_sec: float, end_sec: float) -> TurnMeasurement:
    if not math.isfinite(start_sec) or not math.isfinite(end_sec) or end_sec < start_sec:
        raise ValueError("Turn interval must be finite and ordered.")
    midpoint = (start_sec + end_sec) / 2
    half = WINDOW_SECONDS / 2
    return TurnMeasurement(midpoint, rotation_between(trace, midpoint - half, midpoint + half))


def save_motion(trace: MotionTrace, turn_midpoints: dict[str, float]) -> SavedMotion:
    return SavedMotion(
        rotation_per_second=[rotation_between(trace, second, second + 1)
                             for second in range(math.ceil(trace.duration_sec))],
        rotation_per_frame=[-shift.dx_px * trace.degrees_per_pixel for shift in trace.shifts],
        turn_midpoints=dict(turn_midpoints),
    )


def oversized_right_angle(reported_direction: str, measurement: TurnMeasurement) -> bool:
    """Conservative size check: never check U-turn size."""
    return reported_direction in {"left", "right"} and magnitude_at_least(measurement.degrees, OVERSIZED_RIGHT_ANGLE_DEGREES)


def magnitude_at_least(degrees: float, threshold: float) -> bool:
    # Fractional frame boundaries can put an exact 20/60/150-degree sum a few
    # floating-point ulps below its threshold. This is numerical tolerance,
    # not a calibration or a confidence threshold.
    return abs(degrees) >= threshold or math.isclose(abs(degrees), threshold, rel_tol=0, abs_tol=1e-9)


def detect_candidates(
    trace: MotionTrace, *, excluded_intervals: Iterable[tuple[float, float]],
) -> list[TurnMeasurement]:
    """Find >=60-degree four-second windows outside reported turns and pans.

    Reject windows overlapping those event intervals, then keep the strongest
    non-overlapping windows so one rotation produces one proposed insertion.
    """
    excluded = tuple(excluded_intervals)
    half = WINDOW_SECONDS / 2
    candidates = []
    for tick in range(math.ceil(half * trace.fps), math.floor((trace.duration_sec - half) * trace.fps) + 1):
        midpoint = tick / trace.fps
        start, end = midpoint - half, midpoint + half
        if any(start < stop and end > begin for begin, stop in excluded):
            continue
        degrees = rotation_between(trace, start, end)
        if magnitude_at_least(degrees, UNREPORTED_TURN_DEGREES):
            candidates.append(TurnMeasurement(midpoint, degrees))
    selected: list[TurnMeasurement] = []
    for candidate in sorted(candidates, key=lambda item: (-abs(item.degrees), item.midpoint_sec)):
        if all(abs(candidate.midpoint_sec - other.midpoint_sec) >= WINDOW_SECONDS for other in selected):
            selected.append(candidate)
    return sorted(selected, key=lambda item: item.midpoint_sec)
