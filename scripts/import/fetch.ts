// Step 1 of the bulk course importer: discover marathons on goandrace.com and
// download their GPX into data/gpx_sources/.
//
// This script only fetches. It derives no seed rows and writes nothing into
// src/ — that is qa.ts's job, once the Python parser has produced geometry.
// Keeping the network step separate means a re-run resumes instead of
// re-downloading, and a QA rule can change without touching the site again.
//
//   node scripts/import/fetch.ts --year-start 2026 --year-end 2027 --limit 50
//
// Flags:
//   --year-start / --year-end   calendar range (default 2026..2027)
//   --limit <n>                 stop after n new events (default 50)
//   --batch <name>              staging file name (default import-<yyyy-mm-dd>)
//   --city <name>               only events the calendar lists under this city
//   --url <event-page-url>      one specific event; skips discovery entirely
//   --only <slug,...>           restrict to these proposed course slugs
//   --dry-run                   list what would be fetched; download nothing
//
// Discovery pages the calendar's own JSON endpoint rather than scraping the
// HTML, which only ever renders its first 28 results. Events without a course
// map are still returned; they fail later with "links no course map", which is
// cheap and honest — plenty of big races have an event page and no geometry
// (Berlin 2026, at the time of writing).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  GPX_DIR,
  ORIGIN,
  REQUEST_DELAY_MS,
  RAW_DIR,
  flagNumber,
  flagValue,
  getResponse,
  getText,
  proposeCourseSlug,
  slugify,
  sleep,
  type RawBatch,
  type RawEvent,
} from "./shared.ts";
import { PUBLISHED_COURSE_SLUGS } from "../../src/db/seed/slug-ledger.ts";

// The calendar page renders only its first page of results as HTML — the rest
// arrive through the same JSON endpoint its "load more" button calls. Scraping
// the page therefore caps you at 28 events; this endpoint reports the true
// total (128 marathons across 2026-27 at the time of writing) and pages
// through all of it.
const CALENDAR_API = `${ORIGIN}/it/api_calendario.php`;
const EVENT_BASE = `${ORIGIN}/en/`;

interface CalendarPage {
  mapData?: { popup?: string; lat?: string; lon?: string }[];
  totalEvents?: number;
  page?: number;
  limit?: number;
}

/** One discovered event: its page URL and the city the calendar lists it under. */
export interface Discovered {
  eventUrl: string;
  city: string;
}

function calendarPageUrl(yearStart: number, yearEnd: number, page: number): string {
  const params = new URLSearchParams({
    ok_marath: "ok_marath",
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
 * Each mapData entry's popup is a fragment shaped
 * `<b><a href="running-events/…php">Name 2026</a></b><br>City`, so both the
 * event URL and its city come straight out of it — which is what makes the
 * --city filter possible without fetching every event page first.
 */
function parsePopup(popup: string): Discovered | null {
  const href = popup.match(/href="([^"]+\.php)"/);
  if (!href) return null;
  const city = popup.split(/<br\s*\/?>/i)[1]?.replace(/<[^>]*>/g, "").trim() ?? "";
  const url = new URL(href[1], EVENT_BASE);
  url.hash = "";
  url.search = "";
  return { eventUrl: url.toString(), city };
}

async function discoverEvents(
  yearStart: number,
  yearEnd: number,
): Promise<Discovered[]> {
  const found = new Map<string, Discovered>();
  let total = Infinity;
  for (let page = 1; page <= 40; page += 1) {
    const raw = await getText(calendarPageUrl(yearStart, yearEnd, page));
    const data = JSON.parse(raw) as CalendarPage;
    total = data.totalEvents ?? total;
    const entries = data.mapData ?? [];
    if (entries.length === 0) break;
    for (const entry of entries) {
      const parsed = parsePopup(entry.popup ?? "");
      if (parsed) found.set(parsed.eventUrl, parsed);
    }
    if (found.size >= total) break;
    await sleep(REQUEST_DELAY_MS);
  }
  return [...found.values()].sort((a, b) => a.eventUrl.localeCompare(b.eventUrl));
}

interface EventLd {
  name?: string;
  startDate?: string;
  location?: { address?: Record<string, string> };
  organizer?: { name?: string; url?: string };
}

/** The one schema.org SportsEvent block each event page carries. */
function extractJsonLd(html: string): EventLd | null {
  for (const m of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      const parsed = JSON.parse(m[1].trim()) as EventLd & { "@type"?: string };
      if (parsed["@type"] === "SportsEvent") return parsed;
    } catch {
      // Their JSON-LD occasionally carries a trailing comma. Not fatal on its
      // own — QA will mark the course `review` for the missing fields.
    }
  }
  return null;
}

/**
 * Course-map page URLs, best first. The `-3d` variant renders the same route as
 * a flyover and carries no GPX link, so it is dropped rather than fetched.
 */
function extractMapUrls(html: string, base: string): string[] {
  const seen = new Set<string>();
  for (const m of html.matchAll(/href="([^"]*\/map\/[^"]*course-map[^"]*\.php)"/g)) {
    if (/-3d\.php$/.test(m[1])) continue;
    seen.add(new URL(m[1], base).toString());
  }
  return [...seen].sort();
}

function extractGpxUrl(html: string, base: string): string | null {
  const m = html.match(/href="([^"]*\.gpx(?:\?[^"]*)?)"/);
  return m ? new URL(m[1], base).toString() : null;
}

/**
 * Scrape one event page and, if it has geometry, download the GPX.
 *
 * `provisionalSlug` comes from the URL filename and is only a placeholder: the
 * real slug is derived from the event's own schema.org `name`, because the URL
 * filename repeats the city ("barcelona-marathon-2026-barcelona") and this
 * identifier is permanent. `isTaken` re-checks the derived slug — the caller
 * cannot, since it does not exist until this function has fetched the page.
 */
async function scrapeEvent(
  eventUrl: string,
  provisionalSlug: string,
  isTaken: (slug: string) => string | null,
  dryRun: boolean,
): Promise<RawEvent> {
  let courseSlug = provisionalSlug;
  const base: RawEvent = {
    courseSlug,
    eventUrl,
    mapUrl: null,
    gpxUrl: null,
    gpxBytes: null,
    name: courseSlug,
    startDate: null,
    locality: null,
    region: null,
    countryCode: null,
    organizer: null,
    websiteUrl: null,
  };

  const html = await getText(eventUrl);
  const ld = extractJsonLd(html);
  if (ld) {
    const address = ld.location?.address ?? {};
    base.name = ld.name ?? courseSlug;
    base.startDate = ld.startDate ?? null;
    base.locality = address.addressLocality || null;
    base.region = address.addressRegion || null;
    base.countryCode = address.addressCountry || null;
    base.organizer = ld.organizer?.name || null;
    base.websiteUrl = ld.organizer?.url || null;

    if (ld.name) {
      courseSlug = proposeCourseSlug(ld.name);
      base.courseSlug = courseSlug;
      const clash = isTaken(courseSlug);
      if (clash) {
        base.error = `proposed slug "${courseSlug}" ${clash}`;
        return base;
      }
    }
  } else {
    base.error = "no schema.org SportsEvent JSON-LD on the event page";
  }

  const mapUrls = extractMapUrls(html, eventUrl);
  if (mapUrls.length === 0) {
    base.error = "event page links no course map";
    return base;
  }
  base.mapUrl = mapUrls[0];

  await sleep(REQUEST_DELAY_MS);
  const mapHtml = await getText(mapUrls[0], eventUrl);
  const gpxUrl = extractGpxUrl(mapHtml, mapUrls[0]);
  if (!gpxUrl) {
    base.error = "course map page exposes no .gpx link";
    return base;
  }
  base.gpxUrl = gpxUrl;

  if (dryRun) return base;

  await sleep(REQUEST_DELAY_MS);
  const res = await getResponse(gpxUrl, mapUrls[0]);
  const body = Buffer.from(await res.arrayBuffer());
  // A course page that has quietly lost its file serves an HTML error body with
  // a 200. Checking the payload beats trusting the status.
  if (!body.subarray(0, 512).toString("utf8").includes("<gpx")) {
    base.error = `downloaded body is not GPX (${body.byteLength} bytes)`;
    return base;
  }
  writeFileSync(join(GPX_DIR, `${courseSlug}.gpx`), body);
  base.gpxBytes = body.byteLength;
  return base;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const yearStart = flagNumber(argv, "--year-start", 2026);
  const yearEnd = flagNumber(argv, "--year-end", 2027);
  const limit = flagNumber(argv, "--limit", 50);
  const dryRun = argv.includes("--dry-run");
  const batch =
    flagValue(argv, "--batch") ?? `import-${new Date().toISOString().slice(0, 10)}`;
  const only = argv.includes("--only")
    ? new Set(
        (flagValue(argv, "--only") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  const city = flagValue(argv, "--city");
  const directUrl = flagValue(argv, "--url");

  mkdirSync(GPX_DIR, { recursive: true });
  mkdirSync(RAW_DIR, { recursive: true });

  let discovered: Discovered[];
  if (directUrl) {
    // Targeted mode: the caller already has the event page, so skip discovery
    // entirely rather than paging a calendar looking for it.
    discovered = [{ eventUrl: new URL(directUrl).toString(), city: "" }];
    console.log(`direct    ${discovered[0].eventUrl}`);
  } else {
    discovered = await discoverEvents(yearStart, yearEnd);
    console.log(`found     ${discovered.length} marathons in ${yearStart}-${yearEnd}`);
    if (city) {
      const want = slugify(city);
      discovered = discovered.filter(
        (d) => slugify(d.city).includes(want) || d.eventUrl.includes(want),
      );
      console.log(`city      "${city}" matched ${discovered.length}`);
      if (discovered.length === 0) {
        console.log(
          `\nNo marathon in ${yearStart}-${yearEnd} matched "${city}". Either it is\n` +
            `not listed for those years, or it is spelled differently there —\n` +
            `pass the event page directly with --url instead.`,
        );
      }
    }
  }
  const eventUrls = discovered.map((d) => d.eventUrl);

  // The original seven are untouchable: their geometry, checksums and printed
  // paceband links must stay byte-identical, so anything already in the ledger
  // never gets re-fetched.
  const published = new Set(PUBLISHED_COURSE_SLUGS);
  const claimed = new Set<string>();

  /** Why a slug cannot be used, or null if it is free. */
  const isTaken = (slug: string): string | null => {
    if (published.has(slug)) return "is already in the published slug ledger";
    if (claimed.has(slug)) return "collides with another course in this batch";
    if (existsSync(join(GPX_DIR, `${slug}.gpx`))) {
      return "already has a GPX in data/gpx_sources";
    }
    return null;
  };

  const queue: { eventUrl: string; courseSlug: string }[] = [];
  let skipped = 0;

  for (const eventUrl of eventUrls) {
    const filename = decodeURIComponent(
      eventUrl.split("/").pop()!.replace(/\.php$/, ""),
    );
    // Provisional only. The real slug comes from the event's schema.org name,
    // which is not known until the page is fetched — so this pre-filter can
    // skip work but never claims an identifier.
    const courseSlug = proposeCourseSlug(filename);
    if (only && !only.has(courseSlug)) continue;
    if (isTaken(courseSlug)) {
      skipped += 1;
      continue;
    }
    queue.push({ eventUrl, courseSlug });
    if (queue.length >= limit) break;
  }

  console.log(`queued    ${queue.length} (skipped ${skipped} already known)`);
  if (dryRun) console.log("dry-run: no GPX will be written\n");

  const events: RawEvent[] = [];
  for (const [i, item] of queue.entries()) {
    await sleep(REQUEST_DELAY_MS);
    const label = `[${i + 1}/${queue.length}] ${item.courseSlug}`;
    try {
      const event = await scrapeEvent(
        item.eventUrl,
        item.courseSlug,
        isTaken,
        dryRun,
      );
      events.push(event);
      if (!event.error) claimed.add(event.courseSlug);
      console.log(
        event.error
          ? `${label} — skipped: ${event.error}`
          : `[${i + 1}/${queue.length}] ${event.courseSlug} — ` +
            `${event.gpxBytes ?? 0} bytes, ${event.startDate ?? "no date"}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      events.push({ ...emptyEvent(item), error: message });
      console.log(`${label} — failed: ${message}`);
    }
  }

  const payload: RawBatch = {
    batch,
    fetchedAt: new Date().toISOString(),
    query: {
      source: directUrl ?? calendarPageUrl(yearStart, yearEnd, 1),
      yearStart: String(yearStart),
      yearEnd: String(yearEnd),
      city: city ?? "",
    },
    events,
  };
  const out = join(RAW_DIR, `${batch}.raw.json`);
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);

  const ok = events.filter((e) => !e.error).length;
  console.log(`\nwrote     ${out}`);
  console.log(`downloaded ${ok} GPX, ${events.length - ok} skipped or failed`);
  if (ok > 0 && !dryRun) {
    console.log(
      `\nnext: python3 scripts/gpx_parser/parse_gpx.py --only ${events
        .filter((e) => !e.error)
        .map((e) => e.courseSlug)
        .join(",")} --report data/import/reports/${batch}.qa.json`,
    );
  }
}

function emptyEvent(item: { eventUrl: string; courseSlug: string }): RawEvent {
  return {
    courseSlug: item.courseSlug,
    eventUrl: item.eventUrl,
    mapUrl: null,
    gpxUrl: null,
    gpxBytes: null,
    name: item.courseSlug,
    startDate: null,
    locality: null,
    region: null,
    countryCode: null,
    organizer: null,
    websiteUrl: null,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
