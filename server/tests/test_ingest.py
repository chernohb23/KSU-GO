import hashlib
import subprocess
import threading
from threading import Event
from types import SimpleNamespace

from video_helpers import upload

from pipeline import ingest
from pipeline.ingest import IngestedVideo


def test_stream_copies_and_returns_original_upload_hash(tmp_path, monkeypatch):
    source = tmp_path / "upload.mov"
    output = tmp_path / "stripped.mov"
    source.write_bytes(b"sample uploaded video")
    clean_report = "Duration: 00:00:12.00, start: 0.0, bitrate: 100 kb/s\nStream #0:0: Video: h264"
    commands = []

    def ffmpeg(args):
        commands.append(args)
        if "-c" in args:
            output.write_bytes(b"stream copied")
        return subprocess.CompletedProcess(args, 0, "", clean_report)

    monkeypatch.setattr(ingest, "_run_ffmpeg", ffmpeg)
    result = ingest.ingest_video(source, output)

    assert result.path == output
    assert result.duration_seconds == 12
    assert result.sha256 == hashlib.sha256(source.read_bytes()).hexdigest()
    assert "-map_metadata" in commands[1]
    assert "-map_metadata:s" in commands[1]
    assert commands[1][commands[1].index("-c") + 1] == "copy"


def test_gps_remaining_after_strip_aborts_and_removes_output(tmp_path, monkeypatch):
    source = tmp_path / "upload.mov"
    output = tmp_path / "stripped.mov"
    source.write_bytes(b"sample uploaded video")
    clean_report = "Duration: 00:00:12.00, start: 0.0, bitrate: 100 kb/s\nStream #0:0: Video: h264"
    gps_report = clean_report + "\n  com.apple.quicktime.location.ISO6709 : +34.0000-084.0000+000.0/"
    probe_count = 0

    def ffmpeg(args):
        nonlocal probe_count
        if "-c" in args:
            output.write_bytes(b"copied with gps unexpectedly")
            return subprocess.CompletedProcess(args, 0, "", "")
        probe_count += 1
        report = clean_report if probe_count == 1 else gps_report
        return subprocess.CompletedProcess(args, 0, "", report)

    monkeypatch.setattr(ingest, "_run_ffmpeg", ffmpeg)
    try:
        ingest.ingest_video(source, output)
    except AssertionError as error:
        assert "GPS location metadata remains" in str(error)
    else:
        raise AssertionError("Ingest accepted GPS metadata after stripping.")

    assert not output.exists()


def test_rejects_video_longer_than_three_minutes(tmp_path, monkeypatch):
    source = tmp_path / "upload.mov"
    source.write_bytes(b"sample uploaded video")
    long_report = "Duration: 00:03:00.01, start: 0.0, bitrate: 100 kb/s\nStream #0:0: Video: h264"
    monkeypatch.setattr(
        ingest,
        "_run_ffmpeg",
        lambda args: subprocess.CompletedProcess(args, 0, "", long_report),
    )

    try:
        ingest.ingest_video(source, tmp_path / "stripped.mov")
    except ingest.VideoRejected as error:
        assert "longer than 3 minutes" in str(error)
    else:
        raise AssertionError("Ingest accepted a video longer than three minutes.")


def test_pipeline_ingests_upload_before_live_stages(tmp_path, monkeypatch):
    import mock_pipeline

    source = tmp_path / "upload.mov"
    stripped = tmp_path / "stripped.mov"
    source.write_bytes(b"original upload")
    calls = []

    def fake_ingest(upload_path, stripped_path):
        calls.append((upload_path, stripped_path))
        stripped_path.write_bytes(b"stripped video")
        return IngestedVideo(stripped_path, 1, "b" * 64)

    class FakeStore:
        updated_route = None

        def update_upload(self, route):
            self.updated_route = route

    class FakeRoute:
        id = "route-test"

        def model_copy(self, update):
            return SimpleNamespace(**(vars(self) | update))

    monkeypatch.setattr(mock_pipeline, "ingest_video", fake_ingest)
    store = FakeStore()
    mock_pipeline.run_pipeline(store, FakeRoute(), None, 1, "live", Event(), source, stripped)

    assert calls == [(source, stripped)]
    assert not source.exists()
    assert stripped.read_bytes() == b"stripped video"
    assert store.updated_route.status == "failed"


def test_upload_worker_receives_original_and_stripped_paths(make_client, data_dir, monkeypatch):
    import main

    worker_calls = []
    worker_called = threading.Event()

    def fake_worker(*args):
        worker_calls.append(args)
        worker_called.set()

    monkeypatch.setattr(main, "run_pipeline", fake_worker)

    with make_client() as client:
        response = upload(client)
        assert response.status_code == 202
        assert worker_called.wait(timeout=1)
        upload_path, stripped_path = worker_calls[0][-2:]
        assert upload_path.parent == data_dir / "uploads"
        assert upload_path.is_file()
        assert stripped_path == data_dir / "videos" / f"{response.json()['id']}.mov"
