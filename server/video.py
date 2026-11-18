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


def _uint(source: BinaryIO, box: _Box, offset: int, size: int = 4) -> int:
    return int.from_bytes(_read(source, box.payload + offset, size, box.end), "big")


def _sample_size(source: BinaryIO, table: _Box) -> int:
    count = _uint(source, table, 8)
    if count == 0:
        return 0
    if table.kind == b"stsz":
        fixed_size = _uint(source, table, 4)
        if fixed_size:
            return fixed_size
        if table.payload + 12 + 4 * count > table.end:
            return 0
        return _uint(source, table, 12)

    bits = _uint(source, table, 7, 1)
    if bits not in (4, 8, 16) or table.payload + 12 + (bits * count + 7) // 8 > table.end:
        return 0
    first = _uint(source, table, 12, 2 if bits == 16 else 1)
    return first >> 4 if bits == 4 else first


def _first_video_sample(source: BinaryIO, media: _Box) -> tuple[int, int] | None:
    info = _child(source, media, b"minf")
    table = _child(source, info, b"stbl") if info else None
    if table is None:
        return None
    needed = {b"stsd", b"stsz", b"stz2", b"stco", b"co64"}
    tables = {box.kind: box for box in _boxes(source, table.payload, table.end) if box.kind in needed}
    descriptions = tables.get(b"stsd")
    sizes = tables.get(b"stsz") or tables.get(b"stz2")
    offsets = tables.get(b"stco") or tables.get(b"co64")
    if descriptions is None or sizes is None or offsets is None:
        return None

    if not _uint(source, descriptions, 4):
        return None
    entry = next(_boxes(source, descriptions.payload + 8, descriptions.end), None)
    # Visual sample entries include their codec and a 78-byte description.
    if entry is None or entry.end - entry.payload < 78:
        return None
    if not _uint(source, entry, 24, 2) or not _uint(source, entry, 26, 2):
        return None

    size = _sample_size(source, sizes)
    count = _uint(source, offsets, 4)
    width = 4 if offsets.kind == b"stco" else 8
    if not size or not count or offsets.payload + 8 + width * count > offsets.end:
        return None
    start = _uint(source, offsets, 8, width)
    return start, start + size


def _has_video_track(source: BinaryIO, movie: _Box, file_size: int) -> bool:
    for track in _boxes(source, movie.payload, movie.end):
        if track.kind != b"trak":
            continue
        media = _child(source, track, b"mdia")
        if media is None:
            continue
        handler = _child(source, media, b"hdlr")
        if handler is None or _read(source, handler.payload + 8, 4, handler.end) != b"vide":
            continue
        sample = _first_video_sample(source, media)
        if sample is None:
            continue
        start, end = sample
        if any(
            box.kind == b"mdat" and box.payload <= start < end <= box.end
            for box in _boxes(source, 0, file_size)
        ):
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
    for box in _boxes(source, 0, size):
        if box.kind == b"moov":
            movie = box
    if movie is None:
        raise APIError("video_rejected")
    header = _child(source, movie, b"mvhd")
    if header is None or not _has_video_track(source, movie, size):
        raise APIError("video_rejected")
    return _duration(source, header)
