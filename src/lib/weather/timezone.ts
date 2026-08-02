// Wall-clock → absolute-instant conversion for the forecast lookup.
//
// Why this exists: a race start is entered as a local wall clock at the course
// ("2026-09-27" + "09:15" means quarter past nine *in Berlin*), but Tomorrow.io
// timestamps its hourly entries as absolute UTC instants. Pairing the two
// requires knowing the course's UTC offset on race day — which is not fixed,
// because of DST. Berlin in September is UTC+2; the same clock time in
// December is UTC+1.
//
// Without this conversion the naive string "2026-09-27T09:15:00" is parsed in
// whatever zone the runtime happens to be in (UTC on Vercel), silently
// selecting the wrong forecast hours — 2 hours off for Berlin, 9 for Tokyo.
//
// NOTE ON `Intl`: `src/lib/units/date.ts` bans `Intl` because *display* must be
// byte-identical across server and client. That rule is about rendering. Here
// `Intl` is used purely as a computation — the IANA offset database is the only
// correct source for "what was the UTC offset in Tokyo on this date", and it
// resolves identically on both sides. The output is an absolute UTC instant,
// not display text.

/**
 * The UTC offset (ms) in `timeZone` at the instant `ts`.
 * Positive east of Greenwich — Europe/Berlin in summer returns +7_200_000.
 */
function offsetMsAt(ts: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(ts));
  const at = (type: string): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  // Re-read the zone's rendered wall clock as if it were UTC; the gap between
  // that and the real instant is precisely the zone's offset.
  const asIfUTC = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    at("hour") % 24, // some locales render midnight as "24"
    at("minute"),
    at("second"),
  );
  return asIfUTC - ts;
}

/**
 * Convert a wall clock at a course into an absolute UTC ISO string.
 *
 * @param dateISO  calendar date as "YYYY-MM-DD"
 * @param hhmm     wall-clock start as "HH:MM" (24h)
 * @param timeZone IANA zone of the course, e.g. "Europe/Berlin"
 * @returns e.g. "2026-09-27T07:15:00.000Z", or null if the inputs are malformed.
 */
export function zonedWallClockToUTC(
  dateISO: string,
  hhmm: string,
  timeZone: string,
): string | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  const time = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!date || !time) return null;

  const [year, month, day] = [+date[1], +date[2], +date[3]];
  const [hour, minute] = [+time[1], +time[2]];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  // Treat the wall clock as UTC, then subtract the zone's offset. The offset
  // itself depends on the instant, so apply it twice: the first pass lands
  // within an hour of the true instant, which is close enough to read the
  // correct side of any DST transition on the second.
  const wallAsUTC = Date.UTC(year, month - 1, day, hour, minute);
  let ts = wallAsUTC;
  for (let i = 0; i < 2; i++) {
    ts = wallAsUTC - offsetMsAt(ts, timeZone);
  }
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}
