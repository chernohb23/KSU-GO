"""Read the size and duration of MP4 and QuickTime uploads in mock mode."""

from io import SEEK_END
from struct import Struct
from typing import BinaryIO, Iterator, NamedTuple

from errors import APIError


MAX_VIDEO_BYTES = 100_000_000
MAX_VIDEO_SECONDS = 180


class _Box(NamedTuple):
    kind: bytes
    start: int
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
        yield _Box(header[4:], offset, payload, box_end)
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


def _usable_video_description(source: BinaryIO, box: _Box) -> bool:
    if not _uint(source, box, 4):
        return False
    entry = next(_boxes(source, box.payload + 8, box.end), None)
    # Visual sample entries include their codec and a 78-byte description.
    return bool(
        entry and entry.end - entry.payload >= 78
        and _uint(source, entry, 24, 2) and _uint(source, entry, 26, 2)
    )


def _media_tracks(source: BinaryIO, movie: _Box) -> Iterator[tuple[_Box, _Box, bytes]]:
    for track in _boxes(source, movie.payload, movie.end):
        if track.kind != b"trak":
            continue
        media = _child(source, track, b"mdia")
        if media is None:
            continue
        handler = _child(source, media, b"hdlr")
        if handler:
            kind = _read(source, handler.payload + 8, 4, handler.end)
            yield track, media, kind


def _video_tables(source: BinaryIO, media: _Box) -> dict[bytes, _Box] | None:
    info = _child(source, media, b"minf")
    table = _child(source, info, b"stbl") if info else None
    if table is None:
        return None
    needed = {b"stsd", b"stsz", b"stz2", b"stco", b"co64"}
    tables = {box.kind: box for box in _boxes(source, table.payload, table.end) if box.kind in needed}
    description = tables.get(b"stsd")
    return tables if description and _usable_video_description(source, description) else None


def _first_video_sample(source: BinaryIO, tables: dict[bytes, _Box]) -> tuple[int, int] | None:
    sizes = tables.get(b"stsz") or tables.get(b"stz2")
    offsets = tables.get(b"stco") or tables.get(b"co64")
    if sizes is None or offsets is None:
        return None

    size = _sample_size(source, sizes)
    count = _uint(source, offsets, 4)
    width = 4 if offsets.kind == b"stco" else 8
    if not size or not count or offsets.payload + 8 + width * count > offsets.end:
        return None
    start = _uint(source, offsets, 8, width)
    return start, start + size


def _has_flat_samples(source: BinaryIO, movie: _Box, file_size: int) -> bool:
    for _, media, kind in _media_tracks(source, movie):
        if kind != b"vide":
            continue
        tables = _video_tables(source, media)
        sample = _first_video_sample(source, tables) if tables else None
        if sample is None:
            continue
        start, end = sample
        if any(
            box.kind == b"mdat" and box.payload <= start < end <= box.end
            for box in _boxes(source, 0, file_size)
        ):
            return True
    return False


def _timestamp_size(source: BinaryIO, box: _Box) -> int:
    version = _uint(source, box, 0, 1)
    if version not in (0, 1):
        raise APIError("video_rejected")
    return 4 if version == 0 else 8


def _time_header(source: BinaryIO, header: _Box) -> tuple[int, int]:
    timestamp_size = _timestamp_size(source, header)
    # Skip the version, flags and the creation and modification times.
    offset = 4 + 2 * timestamp_size
    scale = _uint(source, header, offset)
    ticks = _uint(source, header, offset + 4, timestamp_size)
    # All bits set is another representation of an unknown duration.
    if ticks == (1 << (8 * timestamp_size)) - 1:
        ticks = 0
    return scale, ticks


class _Run(NamedTuple):
    data_offset: int | None
    ticks: int
    media_bytes: int


def _read_run(source: BinaryIO, box: _Box, defaults: tuple[int, int]) -> _Run:
    flags = _uint(source, box, 0) & 0xFFFFFF
    count = _uint(source, box, 4)
    data_offset = None
    pos = 8
    if flags & 1:  # Signed offset from the track fragment's data base.
        data_offset = int.from_bytes(_read(source, box.payload + pos, 4, box.end), "big", signed=True)
        pos += 4
    if flags & 4:  # First sample flags.
        pos += 4

    # The optional per-sample columns are duration, size, flags and composition time.
    columns = (flags >> 8) & 0xF
    has_ticks = bool(columns & 1)
    has_size = bool(columns & 2)
    ticks = 0 if has_ticks else count * defaults[0]
    media_bytes = 0 if has_size else count * defaults[1]
    if has_ticks or has_size:
        row = Struct(">" + "I" * columns.bit_count())
        samples = _read(source, box.payload + pos, row.size * count, box.end)
        for sample in row.iter_unpack(samples):
            if has_ticks:
                ticks += sample[0]
            if has_size:
                media_bytes += sample[int(has_ticks)]
    elif box.payload + pos + 4 * columns.bit_count() * count > box.end:
        raise APIError("video_rejected")
    return _Run(data_offset, ticks, media_bytes)


def _fragment_header(
    source: BinaryIO, header: _Box, moof_start: int, previous_end: int,
    defaults: dict[int, tuple[int, int]],
) -> tuple[int, int, tuple[int, int]]:
    flags = _uint(source, header, 0) & 0xFFFFFF
    track_id = _uint(source, header, 4)
    base = moof_start if flags & 0x020000 else previous_end
    pos = 8
    if flags & 1:  # Absolute base offset.
        base = _uint(source, header, pos, 8)
        pos += 8
    if flags & 2:  # Sample description index.
        pos += 4
    ticks, size = defaults.get(track_id, (0, 0))
    if flags & 8:
        ticks = _uint(source, header, pos)
        pos += 4
    if flags & 16:
        size = _uint(source, header, pos)
    return track_id, base, (ticks, size)


def _fragment_media(source: BinaryIO, fragment: _Box, file_size: int) -> _Box:
    for box in _boxes(source, fragment.end, file_size):
        if box.kind == b"mdat":
            return box
        if box.kind == b"moof":
            break
    raise APIError("video_rejected")


def _fragmented_seconds(source: BinaryIO, movie: _Box, file_size: int, *, has_flat: bool) -> float:
    scales = {}
    video_tracks = set()
    for track, media, kind in _media_tracks(source, movie):
        track_header = _child(source, track, b"tkhd")
        media_header = _child(source, media, b"mdhd")
        if track_header and media_header:
            track_id = _uint(source, track_header, 4 + 2 * _timestamp_size(source, track_header))
            scale, _ = _time_header(source, media_header)
            if scale:
                scales[track_id] = scale
                if kind == b"vide" and _video_tables(source, media):
                    video_tracks.add(track_id)
    extension = _child(source, movie, b"mvex")
    if not scales or extension is None:
        raise APIError("video_rejected")
    defaults = {
        _uint(source, box, 4): (_uint(source, box, 12), _uint(source, box, 16))
        for box in _boxes(source, extension.payload, extension.end) if box.kind == b"trex"
    }

    times: dict[int, tuple[int, int]] = {}
    has_video = has_flat
    for fragment in _boxes(source, 0, file_size):
        if fragment.kind != b"moof":
            continue
        media = _fragment_media(source, fragment, file_size)
        cursor = fragment.start
        for track in _boxes(source, fragment.payload, fragment.end):
            if track.kind != b"traf":
                continue
            header = _child(source, track, b"tfhd")
            if header is None:
                raise APIError("video_rejected")
            track_id, base, track_defaults = _fragment_header(
                source, header, fragment.start, cursor, defaults,
            )
            cursor = base
            ticks = 0
            for box in _boxes(source, track.payload, track.end):
                if box.kind != b"trun":
                    continue
                run = _read_run(source, box, track_defaults)
                if run.data_offset is not None:
                    cursor = base + run.data_offset
                if not run.media_bytes:
                    continue
                next_chunk = cursor + run.media_bytes
                if not media.payload <= cursor < next_chunk <= media.end:
                    raise APIError("video_rejected")
                ticks += run.ticks
                cursor = next_chunk
            if track_id in scales and ticks:
                has_video = has_video or track_id in video_tracks
                decode_header = _child(source, track, b"tfdt")
                first, last = times.get(track_id, (0, 0))
                start = last
                if decode_header:
                    start = _uint(source, decode_header, 4, _timestamp_size(source, decode_header))
                if track_id not in times and not has_flat:
                    first = start
                times[track_id] = min(first, start), max(last, start + ticks)
    if not has_video:
        raise APIError("video_rejected")
    # Audio can extend playback beyond the last video sample.
    first_seconds = min(
        (first / scales[track_id] for track_id, (first, _) in times.items()), default=0.0,
    )
    last_seconds = max(
        (last / scales[track_id] for track_id, (_, last) in times.items()), default=0.0,
    )
    return last_seconds - first_seconds


def video_duration(source: BinaryIO) -> float:
    size = source.seek(0, SEEK_END)
    if size > MAX_VIDEO_BYTES:
        raise APIError("video_rejected", "The video is larger than 100 MB.")

    movie = None
    fragmented = False
    for box in _boxes(source, 0, size):
        if box.kind == b"moov":
            movie = box
        elif box.kind == b"moof":
            fragmented = True
    if movie is None:
        raise APIError("video_rejected")
    header = _child(source, movie, b"mvhd")
    if header is None:
        raise APIError("video_rejected")
    scale, ticks = _time_header(source, header)
    if not scale:
        raise APIError("video_rejected")
    duration = ticks / scale
    has_flat = _has_flat_samples(source, movie, size)
    if fragmented:
        seconds = _fragmented_seconds(source, movie, size, has_flat=has_flat)
        duration = max(duration, seconds)
    elif not has_flat:
        raise APIError("video_rejected")
    if duration <= 0:
        raise APIError("video_rejected")
    if duration > MAX_VIDEO_SECONDS:
        raise APIError("video_rejected", "The video is longer than 3 minutes.")
    return duration
