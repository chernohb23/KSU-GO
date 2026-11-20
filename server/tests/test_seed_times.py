import json
from datetime import UTC, datetime, timedelta

import pytest

from conftest import FIXTURES_DIR, Clock
from seed_times import CAMPUS_TIME, seed_start

CASES = json.loads((FIXTURES_DIR.parent / "seedTimes.cases.json").read_text())


@pytest.mark.parametrize("case", CASES)
def test_seed_start_matches_shared_cases(case):
    assert seed_start(case["offset"], datetime.fromisoformat(case["now"])) == datetime.fromisoformat(case["start"])


@pytest.mark.parametrize("date", ["2026-11-19", "2026-03-08", "2026-11-01"])
def test_every_hour_keeps_live_soon_campus_hours_and_all_seeds_in_the_week(date):
    seeds = json.loads((FIXTURES_DIR / "events.seed.json").read_text())
    for hour in range(24):
        for minute in [0, 17, 30, 59]:
            now = datetime.fromisoformat(date).replace(hour=hour, minute=minute, second=26, microsecond=123000, tzinfo=UTC)
            live = soon = 0
            for seed in seeds:
                start = seed_start(seed["startsInMin"], now)
                assert start < now + timedelta(days=7)
                assert start + timedelta(minutes=seed["durationMin"]) > now
                assert start.second == start.microsecond == 0
                local = start.astimezone(CAMPUS_TIME)
                assert local.minute in (0, 30)
                if start <= now:
                    live += 1
                elif start <= now + timedelta(hours=1):
                    soon += 1
                else:
                    assert 9 * 60 <= local.hour * 60 + local.minute <= 21 * 60
            assert live == 2
            assert soon == 3


def test_api_uses_scheduled_seed_times_and_original_durations(make_client):
    clock = Clock(datetime(2026, 11, 19, 17, 16, 42, 123000, tzinfo=UTC))
    seeds = json.loads((FIXTURES_DIR / "events.seed.json").read_text())
    with make_client(clock=clock) as client:
        events = {event["id"]: event for event in client.get("/api/events?range=week").json()}
    assert len(events) == len(seeds)
    for seed in seeds:
        event = events[seed["id"]]
        start = datetime.fromisoformat(event["startsAt"])
        assert start == seed_start(seed["startsInMin"], clock.now)
        assert datetime.fromisoformat(event["endsAt"]) - start == timedelta(minutes=seed["durationMin"])
