import struct
from time import monotonic, sleep


def box(kind, payload):
    return struct.pack(">I4s", len(payload) + 8, kind) + payload


def movie_bytes(seconds=1, handler=b"vide", sample=b"mock video samples"):
    """Small container fixture with controlled metadata for mock admission tests."""
    header = box(b"mvhd", struct.pack(">IIIIII", 0, 0, 0, 1000, seconds * 1000, 0))
    media = box(b"mdia", box(b"hdlr", bytes(8) + handler))
    return box(b"moov", header + box(b"trak", media)) + box(b"mdat", sample)


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
