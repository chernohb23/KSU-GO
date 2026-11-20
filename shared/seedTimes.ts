// Seed presentation only. Created/edited events keep their exact timestamps.
// server/seed_times.py mirrors this policy for server-backed events.

const MINUTE = 60_000;
const HALF_HOUR = 30 * MINUTE;
const WEEK = 7 * 24 * 60 * MINUTE;
const campusClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parts(date: Date) {
  const fields = new Map(campusClock.formatToParts(date).map(part => [part.type, part.value]));
  return { year: Number(fields.get('year')), month: Number(fields.get('month')), day: Number(fields.get('day')),
    hour: Number(fields.get('hour')), minute: Number(fields.get('minute')), second: Number(fields.get('second')) };
}

/** Resolve an unambiguous campus hour, including when the day changes UTC offset. */
function atCampusHour(date: Date, hour: number, dayOffset = 0): Date {
  const local = parts(date);
  const wall = Date.UTC(local.year, local.month - 1, local.day + dayOffset, hour);
  let instant = wall;
  for (let pass = 0; pass < 2; pass++) {
    const candidate = parts(new Date(instant));
    const offset = Date.UTC(candidate.year, candidate.month - 1, candidate.day,
      candidate.hour, candidate.minute, candidate.second) - instant;
    instant = wall - offset;
  }
  return new Date(instant);
}

/** Half-hour starts, with only the live/soon seeds allowed outside campus hours. */
export function seedStart(startsInMin: number, now: Date): Date {
  const current = now.getTime();
  if (startsInMin <= 0) return new Date(Math.floor((current + startsInMin * MINUTE) / HALF_HOUR) * HALF_HOUR);
  if (startsInMin <= 60) return new Date(Math.floor(current / HALF_HOUR) * HALF_HOUR + Math.ceil(startsInMin / 30) * HALF_HOUR);

  let start = new Date(Math.ceil((current + startsInMin * MINUTE) / HALF_HOUR) * HALF_HOUR);
  const local = parts(start);
  const minutes = local.hour * 60 + local.minute;
  if (minutes < 9 * 60) start = atCampusHour(start, 9);
  else if (minutes > 21 * 60) start = atCampusHour(start, 9, 1);

  // A late seed must remain in its original seven-day browsing window.
  if (startsInMin < WEEK / MINUTE && start.getTime() >= current + WEEK) {
    start = new Date(Math.floor((current + WEEK - 1) / HALF_HOUR) * HALF_HOUR);
    const last = parts(start);
    if (last.hour < 9) start = atCampusHour(start, 21, -1);
    else if (last.hour * 60 + last.minute > 21 * 60) start = atCampusHour(start, 21);
  }
  return start;
}
