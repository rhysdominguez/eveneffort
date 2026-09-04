// Boston Marathon qualifying standards — the age/division table, and the
// cut-off history that makes it honest.
//
// TWO NUMBERS, NOT ONE. The published standard is only half the answer, and
// presenting it alone is the mistake every other BQ calculator makes. Meeting
// the standard buys the right to APPLY; the B.A.A. then fills its time-qualified
// spots with whoever ran furthest under it, so in most years the time that
// actually got people in was minutes faster than the table below. For the 2026
// race, 8,887 runners who met their standard were turned away. `BQ_CUTOFFS`
// carries what was really required, and `qualify.ts` reports both.
//
// AGE IS AGE ON BOSTON RACE DAY, not on the day of the qualifying race. Someone
// who runs a 3:04 marathon at 39 and turns 40 before the following April is
// judged against the 40-44 standard. This is why nothing here reads
// `PacingInput.raceDateISO` — that is the goal race, which is a different date
// and a different fact.
//
// SOURCE: baa.org/races/boston-marathon/qualify, for the 2027 race. Standards
// move rarely (the last change was a five-minute tightening) but they do move,
// so `BQ_YEAR` is exported and rendered rather than left implicit — a table with
// no year on it silently rots.
export type BqDivision = "men" | "women" | "nonbinary";

/** Which race's standards this table is. Rendered in the UI; never implicit. */
export const BQ_YEAR = 2027;

/** Boston race day for `BQ_YEAR` — the date the runner's age is taken on. */
export const BQ_RACE_DATE_ISO = "2027-04-19";

/**
 * The same date, spelled for a field label. Written out rather than formatted:
 * src/lib/units/date.ts forbids `Intl` (it would localise this one label away
 * from the rest of the page's fixed English), and a single constant beside the
 * ISO value is clearer than a formatter for one string.
 */
export const BQ_RACE_DATE_LABEL = "19 April 2027";

/** The B.A.A. accepts no qualifying time from anyone under 18 on race day. */
export const BQ_MIN_AGE = 18;

/** Authoring helper, so the table below reads as times rather than as arithmetic. */
function hms(hours: number, minutes: number): number {
  return hours * 3600 + minutes * 60;
}

export interface BqStandardBand {
  minAge: number;
  /** null on the open-ended top band. */
  maxAge: number | null;
  men: number;
  women: number;
  nonbinary: number;
}

/**
 * The standards, in seconds, **largest `minAge` first** so a lookup returns on
 * the first match — the same shape and the same reason as `TERRAIN_BANDS` in
 * src/lib/pacing/terrain.ts.
 *
 * The non-binary column duplicates the women's column, which is what the B.A.A.
 * publishes today. It is stored as its own column rather than aliased to
 * `women` on purpose: if the two ever diverge that should be a data edit here,
 * not a code change at every call site.
 */
export const BQ_STANDARDS: readonly BqStandardBand[] = [
  { minAge: 80, maxAge: null, men: hms(4, 50), women: hms(5, 20), nonbinary: hms(5, 20) },
  { minAge: 75, maxAge: 79, men: hms(4, 35), women: hms(5, 5), nonbinary: hms(5, 5) },
  { minAge: 70, maxAge: 74, men: hms(4, 20), women: hms(4, 50), nonbinary: hms(4, 50) },
  { minAge: 65, maxAge: 69, men: hms(4, 5), women: hms(4, 35), nonbinary: hms(4, 35) },
  { minAge: 60, maxAge: 64, men: hms(3, 50), women: hms(4, 20), nonbinary: hms(4, 20) },
  { minAge: 55, maxAge: 59, men: hms(3, 30), women: hms(4, 0), nonbinary: hms(4, 0) },
  { minAge: 50, maxAge: 54, men: hms(3, 20), women: hms(3, 50), nonbinary: hms(3, 50) },
  { minAge: 45, maxAge: 49, men: hms(3, 15), women: hms(3, 45), nonbinary: hms(3, 45) },
  { minAge: 40, maxAge: 44, men: hms(3, 5), women: hms(3, 35), nonbinary: hms(3, 35) },
  { minAge: 35, maxAge: 39, men: hms(3, 0), women: hms(3, 30), nonbinary: hms(3, 30) },
  { minAge: 18, maxAge: 34, men: hms(2, 55), women: hms(3, 25), nonbinary: hms(3, 25) },
];

export const BQ_DIVISIONS: readonly BqDivision[] = ["men", "women", "nonbinary"];

/** The B.A.A.'s own wording. These are divisions, not a question about sex. */
export const BQ_DIVISION_LABELS: Record<BqDivision, string> = {
  men: "Men",
  women: "Women",
  nonbinary: "Non-binary",
};

/** The band an age falls in, or null below `BQ_MIN_AGE`. */
export function bqStandardBand(age: number): BqStandardBand | null {
  if (!Number.isFinite(age) || age < BQ_MIN_AGE) return null;
  for (const band of BQ_STANDARDS) {
    if (age >= band.minAge) return band;
  }
  return null;
}

/** The qualifying standard in seconds, or null if there isn't one for this age. */
export function bqStandardSeconds(
  age: number,
  division: BqDivision,
): number | null {
  const band = bqStandardBand(age);
  return band ? band[division] : null;
}

/** "18–34", "80+" — an en dash, matching the rest of the app's ranges. */
export function bandLabel(band: BqStandardBand): string {
  return band.maxAge === null
    ? `${band.minAge}+`
    : `${band.minAge}–${band.maxAge}`;
}

export interface BqCutoff {
  year: number;
  /** Seconds under the standard that were actually required for acceptance. */
  seconds: number;
}

/**
 * What acceptance really cost, newest first. A zero means every qualifier who
 * applied was accepted that year.
 *
 * 2021 (7:47) is the outlier and is kept rather than dropped: the field was cut
 * to roughly half for a delayed, pandemic-era running, so it is a real data
 * point about a real year and quietly deleting it would flatter the numbers.
 * The UI reports a range across recent years, not a single prediction, for
 * exactly this reason — the figure swings on field size and application volume,
 * neither of which is knowable in advance.
 */
export const BQ_CUTOFFS: readonly BqCutoff[] = [
  { year: 2026, seconds: 274 }, // 4:34
  { year: 2025, seconds: 411 }, // 6:51
  { year: 2024, seconds: 329 }, // 5:29
  { year: 2023, seconds: 0 },
  { year: 2022, seconds: 0 },
  { year: 2021, seconds: 467 }, // 7:47
  { year: 2020, seconds: 99 }, // 1:39
  { year: 2019, seconds: 292 }, // 4:52
  { year: 2018, seconds: 203 }, // 3:23
  { year: 2017, seconds: 129 }, // 2:09
  { year: 2016, seconds: 148 }, // 2:28
  { year: 2015, seconds: 62 }, // 1:02
  { year: 2014, seconds: 98 }, // 1:38
  { year: 2013, seconds: 0 },
  { year: 2012, seconds: 74 }, // 1:14
];
