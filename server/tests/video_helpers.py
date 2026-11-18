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


def movie_bytes(seconds=1, handler=b"vide", chunk_offset=None):
    """One uncompressed RGB frame in a QuickTime container."""
    width, height = 4, 2
    duration = seconds * 1000
    matrix = struct.pack(">9I", 65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824)
    frame = bytes((40, 80, 120)) * width * height
    file_type = box(b"ftyp", b"qt  " + bytes(4) + b"qt  ")
    media_data = box(b"mdat", frame)
    if chunk_offset is None:
        chunk_offset = len(file_type) + 8

    movie_header = full_box(b"mvhd", (
        struct.pack(">5IH", 0, 0, 1000, duration, 65536, 256)
        + bytes(10) + matrix + bytes(24) + struct.pack(">I", 2)
    ))
    track_header = full_box(b"tkhd", (
        struct.pack(">5I", 0, 0, 1, 0, duration)
        + bytes(16) + matrix + struct.pack(">2I", width << 16, height << 16)
    ), flags=7)
    media_header = full_box(b"mdhd", struct.pack(">4I2H", 0, 0, 1000, duration, 0, 0))
    handler_box = full_box(b"hdlr", b"mhlr" + handler + bytes(13))
    data_ref = full_box(b"dref", struct.pack(">I", 1) + full_box(b"url ", b"", flags=1))
    sample_entry = box(b"raw ", (
        bytes(6) + struct.pack(">H", 1) + bytes(16)
        + struct.pack(">HHIIIH", width, height, 72 << 16, 72 << 16, 0, 1)
        + bytes(32) + struct.pack(">Hh", 24, -1)
    ))
    sample_table = box(b"stbl", (
        full_box(b"stsd", struct.pack(">I", 1) + sample_entry)
        + full_box(b"stts", struct.pack(">3I", 1, 1, duration))
        + full_box(b"stsc", struct.pack(">4I", 1, 1, 1, 1))
        + full_box(b"stsz", struct.pack(">2I", len(frame), 1))
        + full_box(b"stco", struct.pack(">2I", 1, chunk_offset))
    ))
    media_info = box(b"minf", full_box(b"vmhd", bytes(8), flags=1) + box(b"dinf", data_ref) + sample_table)
    media = box(b"mdia", media_header + handler_box + media_info)
    movie = box(b"moov", movie_header + box(b"trak", track_header + media))
    return file_type + media_data + movie


def upload(client, *, video=None, **fields):
    form = {
        "buildingId": "b-engineering",
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
