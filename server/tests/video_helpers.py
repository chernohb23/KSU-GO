import struct
from time import monotonic, sleep


def box(kind, payload):
    return struct.pack(">I4s", len(payload) + 8, kind) + payload


def header_only_movie():
    header = box(b"mvhd", struct.pack(">5I", 0, 0, 0, 1000, 1000))
    media = box(b"mdia", box(b"hdlr", bytes(8) + b"vide"))
    return box(b"moov", header + box(b"trak", media)) + box(b"mdat", b"no video frames")


def full_box(kind, payload, flags=0):
    return box(kind, struct.pack(">I", flags) + payload)


def _fragment(sequence, start, duration, frame, chunk_offset, track_id=1):
    header = full_box(b"mfhd", struct.pack(">I", sequence))
    track_header = full_box(b"tfhd", struct.pack(">I", track_id), flags=0x020000)
    decode_time = full_box(b"tfdt", struct.pack(">I", start))

    def movie_fragment(data_offset):
        run = full_box(b"trun", struct.pack(">IiI", 1, data_offset, duration), flags=0x000101)
        return box(b"moof", header + box(b"traf", track_header + decode_time + run))

    if chunk_offset is None:
        chunk_offset = len(movie_fragment(0)) + 8
    return movie_fragment(chunk_offset) + box(b"mdat", frame)


def _audio_track(matrix, data_ref):
    track_header = full_box(b"tkhd", (
        struct.pack(">5I", 0, 0, 2, 0, 0) + bytes(8)
        + struct.pack(">4h", 0, 0, 256, 0) + matrix + bytes(8)
    ), flags=7)
    media_header = full_box(b"mdhd", struct.pack(">4I2H", 0, 0, 1000, 0, 0, 0))
    handler = full_box(b"hdlr", b"mhlrsoun" + bytes(13))
    pcm = box(b"sowt", bytes(6) + struct.pack(">H", 1) + bytes(8)
              + struct.pack(">4HI", 1, 16, 0, 0, 1000 << 16))
    samples = (
        full_box(b"stsd", struct.pack(">I", 1) + pcm)
        + full_box(b"stts", bytes(4)) + full_box(b"stsc", bytes(4))
        + full_box(b"stsz", bytes(8)) + full_box(b"stco", bytes(4))
    )
    info = box(b"minf", full_box(b"smhd", bytes(4)) + box(b"dinf", data_ref) + box(b"stbl", samples))
    return box(b"trak", track_header + box(b"mdia", media_header + handler + info))


def movie_bytes(seconds=1, handler=b"vide", chunk_offset=None, fragments=0, unknown_duration=0,
                audio_seconds=0):
    """Uncompressed RGB samples in a regular or fragmented QuickTime container."""
    width, height = 4, 2
    duration = seconds * 1000
    header_duration = 0 if fragments else duration
    matrix = struct.pack(">9I", 65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824)
    frame = bytes((40, 80, 120)) * width * height
    file_type = box(b"ftyp", b"qt  " + bytes(4) + b"qt  ")
    media_data = box(b"mdat", frame)
    movie_header = full_box(b"mvhd", (
        struct.pack(">5IH", 0, 0, 1000, unknown_duration if fragments else duration, 65536, 256)
        + bytes(10) + matrix + bytes(24) + struct.pack(">I", 3 if audio_seconds else 2)
    ))
    track_header = full_box(b"tkhd", (
        struct.pack(">5I", 0, 0, 1, 0, header_duration)
        + bytes(16) + matrix + struct.pack(">2I", width << 16, height << 16)
    ), flags=7)
    media_header = full_box(b"mdhd", struct.pack(">4I2H", 0, 0, 1000, header_duration, 0, 0))
    handler_box = full_box(b"hdlr", b"mhlr" + handler + bytes(13))
    data_ref = full_box(b"dref", struct.pack(">I", 1) + full_box(b"url ", b"", flags=1))
    sample_entry = box(b"raw ", (
        bytes(6) + struct.pack(">H", 1) + bytes(16)
        + struct.pack(">HHIIIH", width, height, 72 << 16, 72 << 16, 0, 1)
        + bytes(32) + struct.pack(">Hh", 24, -1)
    ))
    samples = full_box(b"stsd", struct.pack(">I", 1) + sample_entry)
    if fragments:
        samples += (
            full_box(b"stts", bytes(4)) + full_box(b"stsc", bytes(4))
            + full_box(b"stsz", bytes(8)) + full_box(b"stco", bytes(4))
        )
    else:
        if chunk_offset is None:
            chunk_offset = len(file_type) + 8
        samples += (
            full_box(b"stts", struct.pack(">3I", 1, 1, duration))
            + full_box(b"stsc", struct.pack(">4I", 1, 1, 1, 1))
            + full_box(b"stsz", struct.pack(">2I", len(frame), 1))
            + full_box(b"stco", struct.pack(">2I", 1, chunk_offset))
        )
    sample_table = box(b"stbl", samples)
    media_info = box(b"minf", full_box(b"vmhd", bytes(8), flags=1) + box(b"dinf", data_ref) + sample_table)
    media = box(b"mdia", media_header + handler_box + media_info)
    movie = movie_header + box(b"trak", track_header + media)
    if not fragments and not audio_seconds:
        return file_type + media_data + box(b"moov", movie)
    defaults = b""
    stream = file_type
    if fragments:
        defaults += full_box(b"trex", struct.pack(">5I", 1, 1, 0, len(frame), 0))
    else:
        stream += media_data
    if audio_seconds:
        audio_ticks = audio_seconds * 1000
        audio_samples = bytes(audio_ticks * 2)
        movie += _audio_track(matrix, data_ref)
        defaults += full_box(b"trex", struct.pack(">5I", 2, 1, 0, len(audio_samples), 0))
    stream += box(b"moov", movie + box(b"mvex", defaults))
    for index in range(fragments):
        start = index * duration // fragments
        end = (index + 1) * duration // fragments
        stream += _fragment(index + 1, start, end - start, frame, chunk_offset)
    if audio_seconds:
        stream += _fragment(fragments + 1, 0, audio_ticks, audio_samples, None, track_id=2)
    return stream


def upload(client, *, video=None, **fields):
    form = {
        "buildingId": "b-mathematics",
        "destination": "Room 204",
        "startFloor": "1",
        "destinationFloor": "2",
    }
    return client.post(
        "/api/routes",
        data=form | fields,
        files={"video": ("hallway.mov", movie_bytes() if video is None else video, "video/quicktime")},
    )


def wait_for_draft(client, route_id):
    stages = []
    deadline = monotonic() + 4
    while monotonic() < deadline:
        response = client.get(f"/api/routes/{route_id}")
        assert response.status_code == 200
        route = response.json()
        if route["status"] == "draft":
            return route, stages
        assert route["status"] == "processing", route
        stage = route["progress"]["stage"]
        if not stages or stages[-1] != stage:
            stages.append(stage)
        sleep(0.015)
    raise AssertionError("The uploaded route did not become a draft")
