"""Seed-only half-hour scheduling; mirrors shared/seedTimes.ts."""

from datetime import UTC, datetime, timedelta
from math import ceil
from zoneinfo import ZoneInfo

CAMPUS_TIME = ZoneInfo("America/New_York")
HALF_HOUR = timedelta(minutes=30)
WEEK = timedelta(days=7)


def _floor_half_hour(value: datetime) -> datetime:
    return value.replace(minute=value.minute // 30 * 30, second=0, microsecond=0)


def seed_start(starts_in_min: int, now: datetime) -> datetime:
    """Only live/soon seeds may start outside 9 AM–9 PM campus time."""
    now = now.astimezone(UTC)
    target = now + timedelta(minutes=starts_in_min)
    if starts_in_min <= 0:
        return _floor_half_hour(target)
    if starts_in_min <= 60:
        return _floor_half_hour(now) + ceil(starts_in_min / 30) * HALF_HOUR

    start = _floor_half_hour(target)
    if start < target:
        start += HALF_HOUR
    local = start.astimezone(CAMPUS_TIME)
    minutes = local.hour * 60 + local.minute
    if minutes < 9 * 60:
        start = local.replace(hour=9, minute=0).astimezone(UTC)
    elif minutes > 21 * 60:
        start = (local + timedelta(days=1)).replace(hour=9, minute=0).astimezone(UTC)

    if starts_in_min < WEEK.total_seconds() / 60 and start >= now + WEEK:
        start = _floor_half_hour(now + WEEK - timedelta(microseconds=1))
        local = start.astimezone(CAMPUS_TIME)
        if local.hour < 9:
            start = (local - timedelta(days=1)).replace(hour=21, minute=0).astimezone(UTC)
        elif local.hour * 60 + local.minute > 21 * 60:
            start = local.replace(hour=21, minute=0).astimezone(UTC)
    return start
