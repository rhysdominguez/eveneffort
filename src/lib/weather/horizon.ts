// The one place that knows how far ahead a real forecast reaches.
//
// This constant exists because two very different pieces of code have to agree
// on it: the /api/weather route, which decides whether to ask Tomorrow.io at
// all, and the home calendar, which paints a green "forecast available" marker
// on races inside the window. A literal 5 in the calendar that disagreed with
// what the route will actually serve is exactly the bug this prevents: the
// badge would promise conditions the panel then could not produce.
//
// Kept DOM-free and dependency-free so both a server route and a client
// component can import it, and so the arithmetic is unit-testable without a
// clock, a network or a key.
//
// ROADMAP #18 wanted 14 days. It is deferred, not forgotten: Tomorrow.io's
// hourly timeline tops out near 120 hours, and the only provider in this stack
// that reaches further is licensed for non-commercial use, which pacebands are
// not. When that is settled, this number moves and the calendar follows it
// with no other edit. That is the whole point of the module.

/**
 * How many days ahead an hourly forecast is actually available.
 *
 * Tomorrow.io's `timelines.hourly` runs about 120 hours out. Expressed in days
 * rather than hours because every caller reasons in calendar dates: the
 * calendar has no start time to work with, and `selectHourlyWindow` already
 * enforces the precise hourly bound on the route's side.
 */
export const FORECAST_HORIZON_DAYS = 5;

/**
 * Whole days from `todayISO` to `raceDateISO`. Negative for a past date, 0 for
 * today.
 *
 * Both arguments are plain `YYYY-MM-DD` calendar dates, so this is parsed at
 * UTC midnight on purpose: no local timezone can shift a date-only value, and
 * the difference of two midnights is always an exact number of days.
 */
export function daysUntilISO(raceDateISO: string, todayISO: string): number {
  const race = Date.parse(`${raceDateISO}T00:00:00Z`);
  const today = Date.parse(`${todayISO}T00:00:00Z`);
  if (!Number.isFinite(race) || !Number.isFinite(today)) return NaN;
  return Math.round((race - today) / 86_400_000);
}

/**
 * Will this race have a real hourly forecast rather than a climatology
 * average? Pure arithmetic on dates: no weather request is issued, which is
 * what lets the calendar mark hundreds of editions without a single fetch.
 *
 * A PAST race is false. It has recorded conditions, which is a better answer
 * than a forecast, but it is not a forecast and must not wear the mark.
 *
 * AN ESTIMATED DATE IS TRUE, and that is a correction worth explaining because
 * the first cut of this had it the other way round.
 *
 * `estimated` is the DEFAULT in the seed, not the exception: a date is
 * estimated unless it appears in CONFIRMED_EDITIONS, so nearly every race in
 * the next few weeks carries it. Excluding them did not make the mark
 * conservative, it made it invisible — the calendar showed two races five days
 * out and marked neither.
 *
 * It was also out of step with what the app actually does. `weatherSourceFor`
 * in src/lib/editions.ts returns `"forecast"` for ANY future date regardless of
 * confidence, and only forces climatology for an estimated date in the PAST.
 * That asymmetry is right: an estimated past date would be passed off as "the
 * conditions recorded on race day", a claim about a specific morning that may
 * be the wrong morning. A forecast makes no such claim. It is a forecast for
 * the date shown, and the date shown is already labelled "est." on the chip
 * next to the mark, so nothing is being hidden. Marking these is therefore
 * reporting what the weather panel will really do when the runner clicks
 * through, which is the only thing the mark is for.
 *
 * The boundary is INCLUSIVE of day `FORECAST_HORIZON_DAYS`, and that is a
 * choice, not an accident. The last day of the window is partial: 120 hours
 * from now lands mid-afternoon on day 5, so a 08:00 start is covered and a
 * 17:00 start may not be. Marathons start in the morning, so inclusive is
 * right far more often than it is wrong, and when it is wrong the route simply
 * falls through to climatology — the panel still answers, one label different.
 */
export function hasLiveForecast(raceDateISO: string, todayISO: string): boolean {
  const days = daysUntilISO(raceDateISO, todayISO);
  if (!Number.isFinite(days)) return false;
  return days >= 0 && days <= FORECAST_HORIZON_DAYS;
}
