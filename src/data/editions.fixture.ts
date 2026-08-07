// TEST FIXTURE ONLY — do not import from application code.
//
// Editions for the race-calendar tests. Kept out of courses.fixture.ts on
// purpose: that module reads dense geometry off disk, and nothing about a
// calendar needs an elevation array. Importing it here would make every
// calendar test pay for — and break alongside — course geometry loading.
import type { EditionSummary } from "@/types";

/**
 * The date every edition below is positioned against. Calendar tests must
 * compare to THIS, never to the real clock — a suite whose assertions change
 * meaning overnight is a suite that fails on a Tuesday for no reason.
 */
export const FIXTURE_TODAY = "2026-08-04";

/**
 * Hand-written rather than derived from the seed, because it has to cover
 * shapes the current seed happens not to contain — notably two races falling
 * on one day, which is ordinary in reality (marathons cluster on Sundays) even
 * though the seven seeded series never collide. The Chicago/London pair on
 * 2026-10-11 is therefore SYNTHETIC; every other date is the real seeded one.
 */
export const FIXTURE_EDITIONS: EditionSummary[] = [
  {
    editionSlug: "boston-marathon-2026",
    seriesSlug: "boston-marathon",
    displayName: "Boston Marathon",
    courseId: "boston",
    city: "Boston",
    countryCode: "US",
    countryName: "United States",
    raceDateISO: "2026-04-20", // already run, relative to FIXTURE_TODAY
    startTimeLocal: "09:00",
    dateConfidence: "confirmed",
  },
  {
    editionSlug: "sydney-marathon-2026",
    seriesSlug: "sydney-marathon",
    displayName: "Sydney Marathon",
    courseId: "sydney",
    city: "Sydney",
    countryCode: "AU",
    countryName: "Australia",
    raceDateISO: "2026-08-30",
    startTimeLocal: null, // no announced start — the link must omit `start`
    dateConfidence: "confirmed",
  },
  {
    editionSlug: "berlin-marathon-2026",
    seriesSlug: "berlin-marathon",
    displayName: "Berlin Marathon",
    courseId: "berlin",
    city: "Berlin",
    countryCode: "DE",
    countryName: "Germany",
    raceDateISO: "2026-09-27",
    startTimeLocal: "09:15",
    dateConfidence: "confirmed",
  },
  {
    editionSlug: "chicago-marathon-2026",
    seriesSlug: "chicago-marathon",
    displayName: "Chicago Marathon",
    courseId: "chicago",
    city: "Chicago",
    countryCode: "US",
    countryName: "United States",
    raceDateISO: "2026-10-11",
    startTimeLocal: "07:30",
    dateConfidence: "estimated",
  },
  {
    editionSlug: "london-marathon-2026",
    seriesSlug: "london-marathon",
    displayName: "London Marathon",
    courseId: "london",
    city: "London",
    countryCode: "GB",
    countryName: "United Kingdom",
    raceDateISO: "2026-10-11", // deliberately shares Chicago's cell
    startTimeLocal: null,
    dateConfidence: "estimated",
  },
  {
    editionSlug: "tokyo-marathon-2027",
    seriesSlug: "tokyo-marathon",
    displayName: "Tokyo Marathon",
    courseId: "tokyo",
    city: "Tokyo",
    countryCode: "JP",
    countryName: "Japan",
    raceDateISO: "2027-03-07", // the far end of the fixture's range
    startTimeLocal: "09:10",
    dateConfidence: "confirmed",
  },
];
