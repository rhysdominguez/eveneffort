// Snapshot findmymarathon.com's full marathon calendar, every field it
// publishes, into a committed CSV.
//
//   node scripts/import/findmymarathon.ts              # calendar + every detail page
//   node scripts/import/findmymarathon.ts --refresh    # ignore the page cache
//   node scripts/import/findmymarathon.ts --limit 20   # first N detail pages (smoke test)
//
// Writes data/import/findmymarathon-calendar.csv: one row per race listed on
// https://findmymarathon.com/calendar-all.php (771 on 2026-09-25), carrying
// the calendar row plus everything its race-detail.php page states — the
// organizer's website, profile, course type, surface, finishers and BQ% by
// year, race-day weather, max/min elevation and the finish-line coordinate.
//
// This replaces findmymarathon_766_entries_no_url.csv, a hand-pasted copy of
// the same calendar with four columns and no link back to anything. The
// snapshot is committed so reconcile-csv.ts can rebuild the tracker offline;
// the raw HTML is cached under data/import/cache/findmymarathon/ (gitignored)
// so a re-run after a parser fix does not re-fetch 771 pages.
//
// findmymarathon is a ROSTER, never a geometry source: its elevation charts are
// rendered JPEGs and it publishes no route data (README.md). The fields worth
// having for the adoption work are `website` — where the organizer's own
// course file usually lives — and `finishLat`/`finishLon`, which let the
// reconciler tell two same-named races apart by distance instead of by name.
//
// robots.txt (checked 2026-09-25) disallows none of calendar-all.php or
// race-detail.php. One request a second, honest user agent, same as fetch.ts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  IMPORT_DIR,
  REQUEST_DELAY_MS,
  flagNumber,
  getText,
  sleep,
  toCsv,
} from "./shared.ts";

const ORIGIN = "https://findmymarathon.com";
const CACHE_DIR = join(IMPORT_DIR, "cache", "findmymarathon");
export const CALENDAR_CSV = join(IMPORT_DIR, "findmymarathon-calendar.csv");

export const CALENDAR_HEADER = [
  "name", "city", "region", "date", "detailUrl",
  // calendar row
  "profile", "prScore", "latestFinishers", "latestBqPct",
  // detail page
  "raceDates", "courseType", "surface", "bostonQualifier", "wmmQualifier",
  "courseScore", "finishersByYear", "bqPctByYear", "usSizeRank",
  "meanTemp", "avgHigh", "avgLow", "paceGroups",
  "hasElevationChart", "maxElevation", "minElevation",
  "finishLat", "finishLon", "website", "registration", "description",
] as const;

export type CalendarRow = Record<(typeof CALENDAR_HEADER)[number], string>;

// ------------------------------------------------------------------ html

function decode(s: string): string {
  return s
    .replace(/&nbsp;?/g, " ")
    .replace(/&deg;?/g, "°")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/ /g, " ");
}

function text(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Visible text as one trimmed line per text node — the detail page is label/value pairs. */
function lines(html: string): string[] {
  return decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, "\n"),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** `February 7, 2027` / `Saturday, October 10, 2026` / `01/01/2027` -> ISO. */
function isoDate(raw: string): string {
  const us = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1]}-${us[2]}`;
  const t = Date.parse(raw.replace(/^[A-Za-z]+day,\s*/, "") + " UTC");
  return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}

// -------------------------------------------------------------- calendar

interface CalendarEntry {
  name: string;
  zname: string;
  city: string;
  region: string;
  date: string;
  profile: string;
  prScore: string;
  latestFinishers: string;
  latestBqPct: string;
}

/**
 * Every `itemtype="http://schema.org/Event"` row on calendar-all.php. The
 * sponsored "spotlight" table above it is a second listing of races that also
 * appear here, and carries no Event markup, so it is not read.
 */
export function parseCalendar(html: string): CalendarEntry[] {
  const blocks = html.split(/<tr[^>]*itemtype=["']http:\/\/schema\.org\/Event["'][^>]*>/).slice(1);
  return blocks.map((b) => {
    const pick = (re: RegExp) => text(b.match(re)?.[1] ?? "");
    const pct = b.match(/<b>([\d.]+%|N\/A)<\/b>/)?.[1] ?? "";
    return {
      name: pick(/itemprop='name'>([\s\S]*?)<\/span>/),
      zname: decode(b.match(/race-detail\.php\?zname=([^'"#]+)/)?.[1] ?? "").trim(),
      city: pick(/itemprop='addressLocality'>([\s\S]*?)<\/span>/),
      region: pick(/itemprop='addressRegion'>([\s\S]*?)<\/span>/),
      date: isoDate(b.match(/itemprop='startDate' content='([^']*)'/)?.[1] ?? ""),
      profile: pick(/<h4 style="display: inline;">([\s\S]*?)<\/h4>/),
      prScore: pick(/button7'>([\s\S]*?)<\/b>/),
      latestFinishers: b.match(/>([\d,]+) Finishers</)?.[1]?.replace(/,/g, "") ?? "",
      latestBqPct: pct === "N/A" ? "" : pct,
    };
  });
}

/** Drop findmymarathon's affiliate/referral parameters, which identify them, not the race. */
function untrack(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    for (const p of ["aflt_token", "rsus", "aff", "affiliate", "ref"]) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------- detail

const SECTIONS = new Set([
  "Race Dates", "Course Information", "Race Day Weather", "PR Score & Course Score",
  "Race Size", "BQ Percentages", "Miscellaneous Information",
]);

type Detail = Pick<
  CalendarRow,
  | "raceDates" | "courseType" | "surface" | "bostonQualifier" | "wmmQualifier"
  | "courseScore" | "finishersByYear" | "bqPctByYear" | "usSizeRank"
  | "meanTemp" | "avgHigh" | "avgLow" | "paceGroups"
  | "hasElevationChart" | "maxElevation" | "minElevation"
  | "finishLat" | "finishLon" | "website" | "registration" | "description"
> & { profile: string; prScore: string };

/**
 * The "Race Information" block is a run of `Label:` / value line pairs grouped
 * under section headings; year-keyed sections (dates, finishers, BQ%) repeat a
 * `2025:` label per year. Parsed as a flat walk rather than by CSS class
 * because the classes differ between sections of the same page.
 */
export function parseDetail(html: string): Detail {
  const all = lines(html);
  const start = all.indexOf("Race Information");
  const end = all.findIndex((l, i) => i > start && l === "Weather Averages for Last 18 Years");
  const info = start < 0 ? [] : all.slice(start + 1, end < 0 ? start + 120 : end);

  const fields = new Map<string, string>();
  const byYear = new Map<string, string[]>();
  let section = "";
  for (let i = 0; i < info.length; i += 1) {
    const l = info[i];
    if (SECTIONS.has(l)) {
      section = l;
      continue;
    }
    const label = l.match(/^(.+?):$/)?.[1];
    if (!label) continue;
    const value = info[i + 1] ?? "";
    if (SECTIONS.has(value) || /:$/.test(value)) continue;
    i += 1;
    if (/^\d{4}$/.test(label)) {
      byYear.set(section, [...(byYear.get(section) ?? []), `${label}:${value.replace(/ Finishers$/, "")}`]);
    } else {
      fields.set(`${section}/${label}`, value);
    }
  }
  const years = (s: string) =>
    (byYear.get(s) ?? []).filter((v) => !/:(N\/A|No Results)$/.test(v)).join("; ");
  const na = (v: string | undefined) => (!v || v === "N/A" || v === "---" ? "" : v);

  // Finish line, from the hotel-map iframe's `lat=`/`lng=` query.
  const finish = html.match(/[?&]lat=(-?[\d.]+)&lng=(-?[\d.]+)/);
  const rank = html.match(/largest marathon in the U\.S\. in \d{4}/)
    ? text(html.match(/was the <b><u>(\w+)<\/u><\/b> largest marathon in the U\.S\. in (\d{4})/)?.slice(1).join(" in ") ?? "")
    : "";
  const elevation = html.match(/<div id="Elevation"[\s\S]*?END ELEVATION/)?.[0] ?? "";
  const link = (label: string) =>
    untrack(decode(html.match(new RegExp(`<a href="([^"]+)"[^>]*>\\s*<button[^>]*>[\\s\\S]{0,200}?${label}\\s*</button>`))?.[1] ?? ""));

  return {
    raceDates: (byYear.get("Race Dates") ?? []).map((v) => {
      const [y, d] = [v.slice(0, 4), v.slice(5)];
      return `${y}:${isoDate(d) || d}`;
    }).join("; "),
    profile: na(fields.get("Course Information/Profile")),
    courseType: na(fields.get("Course Information/Type")),
    surface: na(fields.get("Course Information/Surface")),
    bostonQualifier: na(fields.get("Course Information/Boston Qualifier?")),
    wmmQualifier: na(fields.get("Course Information/World Marathon Major Qualifier?")),
    prScore: na(fields.get("PR Score & Course Score/PR Score")),
    courseScore: na(fields.get("PR Score & Course Score/Course Score")),
    finishersByYear: years("Race Size"),
    bqPctByYear: years("BQ Percentages"),
    usSizeRank: rank,
    meanTemp: na(fields.get("Race Day Weather/Mean Temp.")),
    avgHigh: na(fields.get("Race Day Weather/Average High")),
    avgLow: na(fields.get("Race Day Weather/Average Low")),
    paceGroups: na(fields.get("Miscellaneous Information/Pace Groups?")),
    hasElevationChart: /elevation\/[^'"\s>]+_e\.jpg/.test(elevation) ? "yes" : "no",
    maxElevation: text(elevation.match(/Max Elevation: <\/span>([^<]*)/)?.[1] ?? ""),
    minElevation: text(elevation.match(/Min Elevation: <\/span>([^<]*)/)?.[1] ?? ""),
    finishLat: finish?.[1] ?? "",
    finishLon: finish?.[2] ?? "",
    website: link("Race Website"),
    registration: link("Race Registration"),
    description: text(html.match(/<div class='descrip'>([\s\S]*?)<\/div>/)?.[1] ?? ""),
  };
}

// ------------------------------------------------------------------ fetch

async function cached(url: string, file: string, refresh: boolean): Promise<{ html: string; fetched: boolean }> {
  const path = join(CACHE_DIR, file);
  if (!refresh && existsSync(path)) return { html: readFileSync(path, "utf8"), fetched: false };
  const html = await getText(url);
  writeFileSync(path, html);
  return { html, fetched: true };
}

function cacheName(zname: string): string {
  return `${zname.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 120)}.html`;
}

async function main(argv: string[]): Promise<void> {
  const refresh = argv.includes("--refresh");
  const limit = flagNumber(argv, "--limit", Infinity);
  mkdirSync(CACHE_DIR, { recursive: true });

  const cal = await cached(`${ORIGIN}/calendar-all.php`, "calendar-all.html", refresh);
  const entries = parseCalendar(cal.html);
  console.log(`calendar-all.php: ${entries.length} races`);
  if (entries.length < 500) {
    throw new Error("fewer than 500 races parsed; the calendar markup has probably changed");
  }

  const rows: CalendarRow[] = [];
  let fetched = 0;
  let failed = 0;
  for (const [i, e] of entries.entries()) {
    const detailUrl = `${ORIGIN}/race-detail.php?zname=${encodeURIComponent(e.zname || e.name)}`;
    let d: Partial<Detail> = {};
    if (i < limit) {
      try {
        if (fetched > 0) await sleep(REQUEST_DELAY_MS);
        const page = await cached(detailUrl, cacheName(e.zname || e.name), refresh);
        if (page.fetched) fetched += 1;
        d = parseDetail(page.html);
      } catch (err) {
        failed += 1;
        console.warn(`  ! ${e.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${entries.length} detail pages (${fetched} fetched)`);
    }
    rows.push({
      name: e.name,
      city: e.city,
      region: e.region,
      date: e.date,
      detailUrl,
      profile: e.profile || d.profile || "",
      prScore: /^[\d.]+$/.test(e.prScore) ? e.prScore : d.prScore ?? "",
      latestFinishers: e.latestFinishers,
      latestBqPct: e.latestBqPct,
      raceDates: d.raceDates ?? "",
      courseType: d.courseType ?? "",
      surface: d.surface ?? "",
      bostonQualifier: d.bostonQualifier ?? "",
      wmmQualifier: d.wmmQualifier ?? "",
      courseScore: d.courseScore ?? "",
      finishersByYear: d.finishersByYear ?? "",
      bqPctByYear: d.bqPctByYear ?? "",
      usSizeRank: d.usSizeRank ?? "",
      meanTemp: d.meanTemp ?? "",
      avgHigh: d.avgHigh ?? "",
      avgLow: d.avgLow ?? "",
      paceGroups: d.paceGroups ?? "",
      hasElevationChart: d.hasElevationChart ?? "",
      maxElevation: d.maxElevation ?? "",
      minElevation: d.minElevation ?? "",
      finishLat: d.finishLat ?? "",
      finishLon: d.finishLon ?? "",
      website: d.website ?? "",
      registration: d.registration ?? "",
      description: d.description ?? "",
    });
  }

  // Calendar order is by month-of-year with no year; date order is what a
  // person scanning the file expects.
  rows.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name));
  writeFileSync(CALENDAR_CSV, toCsv(CALENDAR_HEADER, rows.map((r) => CALENDAR_HEADER.map((h) => r[h]))));
  console.log(`\nwrote ${CALENDAR_CSV}: ${rows.length} rows (${fetched} pages fetched, ${failed} failed)`);
  console.log("next: npm run import:reconcile");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
