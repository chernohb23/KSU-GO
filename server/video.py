"""Read the size and duration of MP4 and QuickTime uploads in mock mode."""

from io import SEEK_END
from typing import BinaryIO, Iterator, NamedTuple

from errors import APIError


MAX_VIDEO_BYTES = 100_000_000
MAX_VIDEO_SECONDS = 180


class _Box(NamedTuple):
    kind: bytes
    payload: int
    end: int


def _read(source: BinaryIO, offset: int, count: int, end: int) -> bytes:
    if offset + count > end:
        raise APIError("video_rejected")
    source.seek(offset)
    data = source.read(count)
    if len(data) != count:
        raise APIError("video_rejected")
    return data


def _boxes(source: BinaryIO, start: int, end: int) -> Iterator[_Box]:
    offset = start
    while offset < end:
        header = _read(source, offset, 8, end)
        size = int.from_bytes(header[:4], "big")
        payload = offset + 8
        if size == 1:
            size = int.from_bytes(_read(source, payload, 8, end), "big")
            payload += 8
        elif size == 0:
            size = end - offset
        box_end = offset + size
        if not payload <= box_end <= end:
            raise APIError("video_rejected")
        yield _Box(header[4:], payload, box_end)
        offset = box_end


def _child(source: BinaryIO, box: _Box, kind: bytes) -> _Box | None:
    return next(
        (child for child in _boxes(source, box.payload, box.end) if child.kind == kind),
        None,
    )


def _has_video_track(source: BinaryIO, movie: _Box) -> bool:
    for track in _boxes(source, movie.payload, movie.end):
        if track.kind != b"trak":
            continue
        media = _child(source, track, b"mdia")
        if media is None:
            continue
        handler = _child(source, media, b"hdlr")
        if handler and _read(source, handler.payload + 8, 4, handler.end) == b"vide":
            return True
    return False


def _duration(source: BinaryIO, header: _Box) -> float:
    version = _read(source, header.payload, 1, header.end)[0]
    if version not in (0, 1):
        raise APIError("video_rejected")
    timestamp_size = 4 if version == 0 else 8
    # Skip the version, flags and the creation and modification times.
    offset = header.payload + 4 + 2 * timestamp_size
    scale = int.from_bytes(_read(source, offset, 4, header.end), "big")
    ticks = int.from_bytes(_read(source, offset + 4, timestamp_size, header.end), "big")
    if not scale or not ticks:
        raise APIError("video_rejected")
    if ticks > scale * MAX_VIDEO_SECONDS:
        raise APIError("video_rejected", "The video is longer than 3 minutes.")
    return ticks / scale


def video_duration(source: BinaryIO) -> float:
    size = source.seek(0, SEEK_END)
    if size > MAX_VIDEO_BYTES:
        raise APIError("video_rejected", "The video is larger than 100 MB.")

    movie = None
    has_samples = False
    for box in _boxes(source, 0, size):
        if box.kind == b"moov":
            movie = box
        if box.kind == b"mdat" and box.payload < box.end:
            has_samples = True
    if movie is None or not has_samples:
        raise APIError("video_rejected")
    header = _child(source, movie, b"mvhd")
    if header is None or not _has_video_track(source, movie):
        raise APIError("video_rejected")
    return _duration(source, header)
