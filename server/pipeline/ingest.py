"""Validate uploaded video and create a metadata-free stream-copy for the pipeline."""

from __future__ import annotations

import hashlib
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import imageio_ffmpeg

MAX_DURATION_SECONDS = 3 * 60
MAX_UPLOAD_BYTES = 100_000_000
_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")
_VIDEO_STREAM_RE = re.compile(r"Stream #\d+:\d+.*?:\s*Video:", re.IGNORECASE)
_LOCATION_TAG_RE = re.compile(r"\b(?:gps|location)[\w.-]*\s*:", re.IGNORECASE)


class VideoRejected(ValueError):
    """The uploaded video cannot be accepted for processing."""


@dataclass(frozen=True)
class IngestedVideo:
    path: Path
    duration_seconds: float
    sha256: str


def _run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), *args],
        capture_output=True,
        text=True,
        check=False,
    )


def _probe(path: Path) -> tuple[float, str]:
    result = _run_ffmpeg(["-hide_banner", "-i", str(path), "-f", "null", "-"])
    report = result.stderr or ""
    duration_match = _DURATION_RE.search(report)
    if result.returncode != 0 or duration_match is None or not _VIDEO_STREAM_RE.search(report):
        raise VideoRejected("The uploaded video is unreadable.")
    hours, minutes, seconds = duration_match.groups()
    duration = int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    return duration, report


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ingest_video(upload_path: str | Path, stripped_path: str | Path) -> IngestedVideo:
    """Strip metadata without re-encoding and assert that GPS is gone.

    ``sha256`` identifies the original uploaded bytes. ``path`` points to the
    stripped full-quality video that later pipeline stages must consume.
    """
    source = Path(upload_path)
    destination = Path(stripped_path)
    if source.resolve() == destination.resolve():
        raise ValueError("The stripped video must use a different path from the upload.")
    if not source.is_file() or source.stat().st_size == 0:
        raise VideoRejected("The uploaded video is unreadable.")
    if source.stat().st_size > MAX_UPLOAD_BYTES:
        raise VideoRejected("The uploaded video is larger than 100 MB.")

    duration, _ = _probe(source)
    if duration > MAX_DURATION_SECONDS:
        raise VideoRejected("The uploaded video is longer than 3 minutes.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    result = _run_ffmpeg([
        "-y", "-i", str(source), "-map", "0", "-map_metadata", "-1",
        "-map_metadata:s", "-1", "-c", "copy", str(destination),
    ])
    if result.returncode != 0 or not destination.is_file():
        destination.unlink(missing_ok=True)
        raise VideoRejected("The uploaded video could not be prepared.")

    # Decode and inspect the output before returning it to any pipeline stage.
    try:
        stripped_duration, output_report = _probe(destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    if _LOCATION_TAG_RE.search(output_report):
        destination.unlink(missing_ok=True)
        raise AssertionError("GPS location metadata remains after video stripping.")

    return IngestedVideo(path=destination, duration_seconds=stripped_duration, sha256=_sha256(source))
