// Backfill REAL past race dates for series we already seed.
//
// Usage:
//   node scripts/import/backfill-dates.ts --year-start 2022 --year-end 2025
//   node scripts/import/backfill-dates.ts --year-start 2022 --year-end 2025 --write
//
//   --year-start / --year-end   calendar range to sweep (default 2022..2025)
//   --refresh                   re-crawl instead of reusing the cached sweep
//   --write                     append the APPROVED matches (see review below)
//                               to CONFIRMED_EDITIONS
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// The year picker lets a runner pace a race that has already been run, and the
// weather panel then shows the conditions actually recorded that morning. That
// lookup is keyed by DATE, so it is only safe for a date we actually know:
// `weatherSourceFor` in src/lib/editions.ts routes any `estimated` date to a
// ten-year climate average instead, and describes it as typical rather than
// actual.
//
// That guard is not cautious, it is load-bearing. Measured across every series
// where we know two or more real years, a recurrence rule derived from one year
// predicts another:
//
//     exactly            55.4%
//     within 1-3 days     8.9%
//     within 4-7 days    22.3%
//     8-31 days out      10.7%
//     more than a month   2.7%
//
// So roughly one estimated date in eight is off by more than a week — enough to
// be a different weather regime — and the tail is brutal: London 2022 moved to
// October (161 days), Cape Town 2025 to October (147 days). Presenting a
// climate average for those is right; presenting "the weather on race day"
// would be confidently wrong.
//
// The fix is therefore more real dates, not a looser guard. This script gets
// them from the same source the import pipeline already trusts for dates.
//
// ---------------------------------------------------------------------------
// HOW
// ---------------------------------------------------------------------------
// The calendar API's `tableHtml` embeds one schema.org SportsEvent blob per
// event, each carrying an ISO `startDate`. That means a whole year of dates
// costs ~37 requests rather than one request per event, and no event page is
// fetched at all — this script only ever reads the calendar listing.
//
// THE REVIEW STEP IS NOT OPTIONAL, for the same reason it is not optional in
// the importer: matching by name gets most of the way and cannot get all of
// it. A dry run writes every candidate to data/import/backfill-review.json
// with `"approved": null`; a human sets each to true or false; `--write` then
// takes only the true ones. The rejects that survived three rounds of
// tightening are instructive — "Neujahrsmarathon Zürich" is a real marathon,
// really in Zurich, and really not the Zurich Marathon.
//
// Matching is by NAME, not slug: goandrace mints a fresh URL slug for every
// year of a recurring race, so "Flying Pig Marathon 2024" and our seeded
// "Cincinnati Flying Pig Marathon" never agree as strings. `findNameMatch` is
// the shared helper that already solves this for fetch.ts, and reusing it means
// one matching contract rather than two that can drift.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  IMPORT_DIR,
  ORIGIN,
  RAW_DIR,
  REPO_ROOT,
  REQUEST_DELAY_MS,
  cleanDisplayName,
  getText,
  matchTokens,
  sleep,
} from "./shared.ts";
import { SERIES_SEED } from "../../src/db/seed/series.ts";
import { CONFIRMED_EDITIONS } from "../../src/db/seed/editions.ts";

const CALENDAR_API = `${ORIGIN}/it/api_calendario.php`;
const EDITIONS_PATH = join(REPO_ROOT, "src", "db", "seed", "editions.ts");
const REVIEW_PATH = join(IMPORT_DIR, "backfill-review.json");

interface ReviewRow {
  seriesSlug: string;
  year: number;
  raceDate: string;
  /** The listing this came from, so a reviewer can judge without re-crawling. */
  listingName: string;
  /** null = undecided. Only `true` is ever written to the seed. */
  approved: boolean | null;
}

interface Listing {
  name: string;
  startDate: string; // "YYYY-MM-DD"
}

function calendarPageUrl(yearStart: number, yearEnd: number, page: number): string {
  const params = new URLSearchParams({
    sport: "running",
    distance: "marathon",
    year_start: String(yearStart),
    month_start: "1",
    day_start: "1",
    year_end: String(yearEnd),
    month_end: "12",
    day_end: "31",
    lang: "en",
    page: String(page),
  });
  return `${CALENDAR_API}?${params}`;
}

/**
 * Pull every listing in a year range out of the calendar's embedded structured
 * data. Only `name` and `startDate` are taken — this script has no business
 * with geometry, and deliberately never opens an event page.
 */
async function sweep(yearStart: number, yearEnd: number): Promise<Listing[]> {
  const out = new Map<string, Listing>();
  let total = Infinity;

  for (let page = 1; page <= 60; page += 1) {
    // `getText` carries the shared UA and one backed-off retry. Worth having:
    // a long sweep reliably draws an ECONNRESET somewhere around page 5, and
    // losing the whole run to one dropped connection is not acceptable when
    // the run costs a few minutes of someone else's bandwidth.
    let data: { tableHtml?: string; totalEvents?: number };
    try {
      data = JSON.parse(await getText(calendarPageUrl(yearStart, yearEnd, page)));
    } catch (err) {
      process.stderr.write(`\n  page ${page} failed (${String(err)}); stopping sweep early\n`);
      break;
    }
    total = data.totalEvents ?? total;

    const blobs =
      data.tableHtml?.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ) ?? [];
    if (blobs.length === 0) break;

    for (const blob of blobs) {
      const json = blob.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/, "");
      let parsed: { name?: string; startDate?: string };
      try {
        parsed = JSON.parse(json);
      } catch {
        continue; // A malformed blob is one listing lost, not a failed sweep.
      }
      const name = parsed.name;
      const startDate = parsed.startDate?.slice(0, 10);
      if (!name || !startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) continue;
      out.set(`${name}|${startDate}`, { name, startDate });
    }

    process.stderr.write(
      `  page ${page}: ${out.size}/${total === Infinity ? "?" : total} listings\r`,
    );
    if (out.size >= total) break;
    await sleep(REQUEST_DELAY_MS);
  }
  process.stderr.write("\n");
  return [...out.values()];
}


// ---------------------------------------------------------------------------
// Matching — deliberately stricter than findNameMatch
// ---------------------------------------------------------------------------
//
// `findNameMatch` answers "is this discovered event already seeded?", where a
// FALSE POSITIVE is safe: the importer skips one race and a human notices the
// gap. Here the asymmetry runs the other way. A false positive writes a wrong
// date as `confirmed`, and a confirmed date is exactly what licenses the app
// to fetch "the conditions recorded on race day" and present them as fact. A
// bad match here would defeat the guard this whole script exists to feed.
//
// The looser matcher really does produce them. Run against the 2022-2025
// sweep it offered, at a perfect 1.00 score:
//
//   buffalo-marathon  <- "Miles for Migraine 2-mile Walk, 5K Run and Relax
//                         Buffalo Event"
//   zurich-marathon   <- "ZURICH Rock'n'Roll Running Series Madrid 2023"
//   rome-marathon     <- "47° Roma-Ostia"            (a half marathon)
//   mugello-marathon  <- "Mezza del Mugello 2022"    (a half marathon)
//
// All four share the same shape: "marathon" and "international" are stop
// words, so a one-word city name is the entire token set on the seeded side,
// and the score divides by the SMALLER set — making {buffalo} a perfect
// subset of anything mentioning Buffalo.
//
// Three rules close it:

/** The event must actually be a marathon, in any of the languages listed. */
const MARATHON_WORD = /marathon|maratona|marat[oó]n|maratona|marathonlauf|marathe/i;

/**
 * Distances and formats that are NOT the marathon, even when the calendar
 * files them under one. Checked against the raw name rather than the token
 * set, because "Mezza del Mugello" and "Roma-Ostia" lose the distinction the
 * moment they are tokenised.
 */
const NOT_THE_MARATHON =
  // "half" in six languages. German "Halbmarathon" and Nordic "halvmaraton"
  // are single words CONTAINING "marathon", so they sail past MARATHON_WORD —
  // "Hella Hamburg Halbmarathon 2023" was matched to hamburg-marathon before
  // this line existed, which would have dated the marathon to the half's day.
  /\bhalf\b|\bmezza\b|\bhalb ?marat|\bhalv ?marat|\bmedia marat|\bsemi[- ]?marat|\bmini ?marat/i.source +
  // Distances and formats that are not the marathon.
  "|" + /\b(5|10|21|30|50)\s?k(m)?\b|\b21[.,]1|\bultra\b|\brelay\b|\bstaffetta\b|\btrail\b|\bwalk\b|\bkids\b|\bfun run\b|\bmiglia\b|\bmile\b/i.source +
  // A multi-day "weekend" listing is dated to the weekend, not to the
  // marathon inside it — Walt Disney World Marathon Weekend 2022 is listed on
  // the 6th and ran the marathon on the 9th.
  "|" + /\bweekend\b/i.source;
const NOT_THE_MARATHON_RE = new RegExp(NOT_THE_MARATHON, "i");

/**
 * How many tokens a listing may carry beyond the seeded name before a
 * single-token match stops meaning anything. A sponsor prefix ("TCS Amsterdam
 * Marathon") is one extra token and is fine; nine extra tokens is a different
 * event that happens to name the same city.
 */
const MAX_EXTRA_TOKENS_FOR_SINGLE_TOKEN_SERIES = 2;

interface Candidate {
  name: string;
  citySlug: string;
  slug: string;
}

/**
 * Returns the ONE series this listing can only be, or null.
 *
 * Ambiguity is a rejection, not a tie-break. "Zurich San Sebastián Marathon"
 * matches the seeded `zurich-marathon` on {zurich} — but Zurich there is the
 * insurer sponsoring a race in Spain, and if `san-sebastian-marathon` is also
 * seeded then two series match and neither is safe to date.
 */
function strictMatch(listingName: string, candidates: Candidate[]): Candidate | null {
  if (!MARATHON_WORD.test(listingName)) return null;
  if (NOT_THE_MARATHON_RE.test(listingName)) return null;

  const listing = matchTokens(cleanDisplayName(listingName));
  if (listing.size === 0) return null;

  const hits: Candidate[] = [];
  for (const c of candidates) {
    const seeded = matchTokens(c.name);
    if (seeded.size === 0) continue;
    // Every distinguishing word of the seeded race must be present.
    let all = true;
    for (const t of seeded) if (!listing.has(t)) { all = false; break; }
    if (!all) continue;

    // A one-word seeded name (usually just a city) is only trustworthy when
    // the listing is close to it. Multi-token names carry their own evidence.
    if (seeded.size === 1) {
      const extra = listing.size - seeded.size;
      if (extra > MAX_EXTRA_TOKENS_FOR_SINGLE_TOKEN_SERIES) continue;
    }
    hits.push(c);
  }
  // Prefer the most specific series that fits; reject only when two equally
  // specific ones do, which is the genuine ambiguity.
  if (hits.length === 0) return null;
  const best = Math.max(...hits.map((h) => matchTokens(h.name).size));
  const top = hits.filter((h) => matchTokens(h.name).size === best);
  return top.length === 1 ? top[0] : null;
}

function flagNumber(argv: string[], flag: string, fallback: number): number {
  const i = argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const yearStart = flagNumber(argv, "--year-start", 2022);
  const yearEnd = flagNumber(argv, "--year-end", 2025);
  const write = argv.includes("--write");

  // The crawl is the slow, impolite part; the matching is what needs tuning.
  // Caching the listings means a matcher change costs nothing and re-runs
  // don't hammer someone else's server.
  const cachePath = join(RAW_DIR, `backfill-${yearStart}-${yearEnd}.raw.json`);
  let listings: Listing[];
  if (existsSync(cachePath) && !argv.includes("--refresh")) {
    listings = JSON.parse(readFileSync(cachePath, "utf8")).listings;
    console.log(`Reusing cached sweep ${yearStart}-${yearEnd} (${listings.length} listings)`);
    console.log("  pass --refresh to re-crawl\n");
  } else {
    console.log(`Sweeping goandrace calendar ${yearStart}-${yearEnd}…`);
    listings = await sweep(yearStart, yearEnd);
    writeFileSync(
      cachePath,
      JSON.stringify({ yearStart, yearEnd, fetchedAt: new Date().toISOString(), listings }, null, 2),
    );
    console.log(`  ${listings.length} listings (cached)\n`);
  }

  // Already-known (series, year) pairs never get a second entry — the seed
  // would emit two rows for one running, and the unique (series, date)
  // constraint would reject the batch.
  const known = new Set(
    CONFIRMED_EDITIONS.map((e) => `${e.seriesSlug}|${e.year}`),
  );
  const candidates = SERIES_SEED.map((s) => ({
    name: s.name,
    citySlug: s.citySlug,
    slug: s.slug,
  }));

  const found = new Map<string, { slug: string; year: number; date: string; name: string }>();
  const conflicts: string[] = [];

  for (const l of listings) {
    const match = strictMatch(l.name, candidates);
    if (!match) continue;
    const year = Number(l.startDate.slice(0, 4));
    const key = `${match.slug}|${year}`;
    if (known.has(key)) continue;

    const prior = found.get(key);
    if (prior && prior.date !== l.startDate) {
      // Two different dates claiming the same series-year. Could be a genuine
      // two-day event or a bad match; either way a human decides, not this.
      conflicts.push(`${key}: ${prior.date} vs ${l.startDate} ("${prior.name}" / "${l.name}")`);
      found.delete(key);
      known.add(key); // don't let a third listing resurrect it
      continue;
    }
    found.set(key, { slug: match.slug, year, date: l.startDate, name: l.name });
  }

  const rows = [...found.values()].sort(
    (a, b) => a.slug.localeCompare(b.slug) || a.year - b.year,
  );

  console.log(`NEW confirmable dates: ${rows.length} across ${new Set(rows.map((r) => r.slug)).size} series`);
  if (conflicts.length > 0) {
    console.log(`\nSkipped — conflicting dates for one series-year (${conflicts.length}):`);
    for (const c of conflicts.slice(0, 20)) console.log(`  ${c}`);
  }
  console.log("\nSample:");
  for (const r of rows.slice(0, 15)) {
    console.log(`  ${r.slug.padEnd(34)} ${r.year}  ${r.date}   ${r.name}`);
  }

  // Carry forward any decision already made, so re-running never silently
  // resurrects something a human rejected.
  const prior = new Map<string, boolean | null>();
  if (existsSync(REVIEW_PATH)) {
    for (const r of JSON.parse(readFileSync(REVIEW_PATH, "utf8")) as ReviewRow[]) {
      prior.set(`${r.seriesSlug}|${r.year}`, r.approved);
    }
  }

  const review: ReviewRow[] = rows.map((r) => ({
    seriesSlug: r.slug,
    year: r.year,
    raceDate: r.date,
    listingName: r.name,
    approved: prior.get(`${r.slug}|${r.year}`) ?? null,
  }));

  if (!write) {
    writeFileSync(REVIEW_PATH, JSON.stringify(review, null, 2) + "\n");
    const undecided = review.filter((r) => r.approved === null).length;
    console.log(`\nWrote ${review.length} candidates to data/import/backfill-review.json`);
    console.log(`  ${undecided} still undecided — set "approved" to true or false on each.`);
    console.log(`  Then re-run with --write to append the approved ones.`);
    console.log(`\nCheck each listingName IS the marathon, and IS this series:`);
    console.log(`  a half marathon, a sponsor that shares a city's name, or a`);
    console.log(`  second marathon in the same city all reach this file.`);
    return;
  }

  const approved = review.filter((r) => r.approved === true);
  if (approved.length === 0) {
    console.log("\nNothing approved in data/import/backfill-review.json — nothing written.");
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const block = [
    "",
    `  // Backfilled from the goandrace calendar archive by`,
    `  // scripts/import/backfill-dates.ts on ${stamp} (${yearStart}-${yearEnd}),`,
    `  // each entry approved by hand in data/import/backfill-review.json.`,
    `  // Dates as published by the event listing — same source and standing as`,
    `  // the import batches above. These exist so a past edition can show the`,
    `  // weather actually recorded on the day rather than a climate average;`,
    `  // see the script header for how far a recurrence rule misses when it has`,
    `  // to guess.`,
    ...approved.map(
      (r) => `  { seriesSlug: "${r.seriesSlug}", year: ${r.year}, raceDate: "${r.raceDate}" },`,
    ),
    "",
  ].join("\n");

  const src = readFileSync(EDITIONS_PATH, "utf8");
  const marker = "\n];\n\n/**\n * Resolve the nth (or last) given weekday";
  const at = src.indexOf(marker);
  if (at === -1) throw new Error("Could not find the end of CONFIRMED_EDITIONS.");
  writeFileSync(EDITIONS_PATH, src.slice(0, at) + block + src.slice(at));
  console.log(`\nWrote ${approved.length} approved entries to src/db/seed/editions.ts`);
  console.log("Next: npm run test && npm run db:seed && rm -rf .next");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
