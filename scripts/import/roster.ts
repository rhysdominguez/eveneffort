// Discovery, part three: a roster of the world's marathons.
//
//   node scripts/import/roster.ts
//   node scripts/import/roster.ts --dry-run
//
// Flags:
//   --dry-run    fetch and parse; print the summary, write no CSV
//   --only <continent,...>   restrict to these pages (europe, asia, …)
//
// Why this exists: the two discovery sources this repo already has are both
// regional. goandrace is strong in the US and Italy and thin everywhere else,
// and its 2025-2029 window is exhausted. findmymarathon's 766-row tracker is
// almost entirely US. Neither of them can tell us about a marathon in Chile or
// Latvia, so nothing ever proposed one. We seed 112 US courses and 2 Brazilian.
//
// Wikipedia's six per-continent "List of marathon races" pages are the missing
// roster, and they are better than a roster: each row carries the race name,
// its city, its country, the month it runs, its inception year and a link to
// the organizer's own site, **and it encodes the World Athletics label tier as
// the row's background colour** — Platinum, Gold, Elite, Label — with bold for
// a World Marathon Major and gray for defunct. That is the discovery list and
// the reach ranking in a single parse, which is why rank.ts needs no separate
// World Athletics crawl.
//
// Read through the MediaWiki API (action=parse&prop=wikitext), which is the
// sanctioned access path, under CC BY-SA. See docs/COURSE-RIGHTS.md §3 for the
// per-source rights analysis — and in particular for why AIMS, the obvious
// other candidate, is NOT crawled here: its robots.txt disallows /events and
// /members for every user agent, which is precisely its calendar and member
// list.
//
// Output is data/import/world-roster.csv, committed, which backlog.ts merges
// with the other two feeders. This script never touches geometry: a roster
// tells us a race exists, never where it goes.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  COUNTRY_NAMES,
  IMPORT_DIR,
  RAW_DIR,
  REQUEST_DELAY_MS,
  USER_AGENT,
  cleanDisplayName,
  flagValue,
  parseCsv,
  proposeCourseSlug,
  sleep,
  toCsv,
} from "./shared.ts";

const ROSTER_CSV = join(IMPORT_DIR, "world-roster.csv");
const API = "https://en.wikipedia.org/w/api.php";

const PAGES: Record<string, string> = {
  africa: "List_of_marathon_races_in_Africa",
  asia: "List_of_marathon_races_in_Asia",
  europe: "List_of_marathon_races_in_Europe",
  "north-america": "List_of_marathon_races_in_North_America",
  oceania: "List_of_marathon_races_in_Oceania",
  "south-america": "List_of_marathon_races_in_South_America",
};

/**
 * The label tiers, keyed by the background colour the tables use for them.
 *
 * These are World Athletics' Label Road Races categories, and they are the
 * single best public proxy for how big a race is: a Platinum label requires an
 * international elite field, chip timing, doping control and a certified
 * course. The colours come from each page's own Legend section.
 */
const LABEL_BY_COLOUR: Record<string, Label> = {
  "#cccccc": "platinum",
  gold: "gold",
  "#9e8dc5": "elite",
  "#a6fb65": "label",
};

export type Label = "platinum" | "gold" | "elite" | "label" | null;

/**
 * Wikipedia's country templates, mapped to ISO 3166-1 alpha-2.
 *
 * The tables mix IOC codes (GER, NED, RSA, SUI, GRE, DEN, SLO, CRO) with ISO
 * alpha-3 (DEU, NLD, CHL, LVA, BGR, VNM, GRL) in the same column, sometimes on
 * the same page, so neither standard alone decodes it. This table covers every
 * code that actually appears across the six pages as of 2026-09-23; anything
 * else is reported by name rather than guessed, because a wrong country code
 * puts a race on the wrong continent and picks the wrong timezone band.
 *
 * The UK's constituent countries (ENG, SCO, WAL, NIR) all fold to GB, which is
 * what `city.countryCode` holds for the already-seeded British races.
 */
const COUNTRY_TEMPLATE: Record<string, string> = {
  // Europe
  AUT: "AT", BEL: "BE", BGR: "BG", CRO: "HR", CYP: "CY", CZE: "CZ",
  DEN: "DK", DEU: "DE", ENG: "GB", ESP: "ES", EST: "EE", FIN: "FI",
  FLK: "FK", FRA: "FR", GER: "DE", GRE: "GR", GRL: "GL", HUN: "HU",
  ISL: "IS", IRL: "IE", ITA: "IT", JEY: "JE", LTU: "LT", LUX: "LU",
  LVA: "LV", MD: "MD", MKD: "MK", MNE: "ME", MON: "MC", NED: "NL",
  NIR: "GB", NLD: "NL", NOR: "NO", POL: "PL", POR: "PT", ROM: "RO",
  RUS: "RU", SCO: "GB", SLO: "SI", SRB: "RS", SUI: "CH", SVK: "SK",
  SWE: "SE", TUR: "TR", UKR: "UA", WAL: "GB",
  // Asia
  CAM: "KH", CHN: "CN", HKG: "HK", IDN: "ID", INA: "ID", IND: "IN",
  ISR: "IL", JPN: "JP", KAZ: "KZ", KGZ: "KG", KOR: "KR", KUW: "KW",
  LIB: "LB", MAC: "MO", MAS: "MY", MNG: "MN", NEP: "NP", PAK: "PK",
  PHI: "PH", PRK: "KP", PSE: "PS", QAT: "QA", ROC: "TW", SAU: "SA",
  SGP: "SG", SRI: "LK", THA: "TH", UAE: "AE", UZB: "UZ", VNM: "VN",
  // Africa
  BWA: "BW", CMR: "CM", GAB: "GA", GHA: "GH", KEN: "KE", LBR: "LR",
  MAR: "MA", NGR: "NG", RSA: "ZA", RWA: "RW", TAN: "TZ", TUN: "TN",
  UGA: "UG",
  // Americas
  ARG: "AR", BRA: "BR", CAN: "CA", CHL: "CL", COL: "CO", CUB: "CU",
  ECU: "EC", JAM: "JM", MEX: "MX", PAR: "PY", PER: "PE", USA: "US",
  // Oceania
  AUS: "AU", NZL: "NZ", PLW: "PW", TAH: "PF",
};

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export interface RosterRace {
  raceSlug: string;
  name: string;
  city: string;
  countryCode: string;
  countryName: string;
  /** Typical month, 1-12, or null when the table says "varies" or nothing. */
  month: number | null;
  inception: number | null;
  label: Label;
  isMajor: boolean;
  websiteUrl: string;
  continent: string;
  wikiPage: string;
}

// ---------------------------------------------------------------- wikitext

/** `[[Pella]]–[[Thessaloniki]]` -> `Pella-Thessaloniki`; `[[A|B]]` -> `B`. */
function stripMarkup(cell: string): string {
  return cell
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<sub>[\s\S]*?<\/sub>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first bare external link in a cell: `[https://… ]` or `[https://…]`. */
function firstUrl(cell: string): string {
  const m = cell.match(/\[(https?:\/\/[^\s\]]+)/);
  if (!m) return "";
  // Wikipedia keeps dead official sites as archive.org snapshots. The snapshot
  // is still the best pointer we have to the organizer's own domain, so it is
  // unwrapped rather than dropped — adopt.ts wants a live site, and the live
  // site is usually the URL inside the snapshot.
  const wayback = m[1].match(/web\.archive\.org\/web\/\d+(?:\w+)?\/(https?:\/\/.+)$/);
  return wayback ? wayback[1] : m[1];
}

/** Split a wikitable row into cells, handling both `||` and leading-`|` style. */
function splitCells(row: string): string[] {
  const cells: string[] = [];
  for (const line of row.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) {
      // A continuation of the previous cell (a multi-line ref, usually).
      if (cells.length > 0) cells[cells.length - 1] += ` ${t}`;
      continue;
    }
    for (const piece of t.slice(1).split("||")) cells.push(piece);
  }
  return cells;
}

/**
 * Drop a cell's attribute prefix: `bgcolor=#CCC|[[Name]]` -> `[[Name]]`.
 *
 * Splitting naively on the first `|` is wrong and was the first bug this parser
 * shipped: a wikilink uses the same character, so `[[Hopkinton, Massachusetts|
 * Hopkinton]] to [[Boston]]` came out as `Hopkinton]] to Boston`. A real
 * attribute prefix contains an `=` and never contains `[[`, which is enough to
 * tell the two apart.
 */
function stripAttributes(cell: string): string {
  const bar = cell.indexOf("|");
  if (bar < 0) return cell;
  const prefix = cell.slice(0, bar);
  return prefix.includes("=") && !prefix.includes("[[") ? cell.slice(bar + 1) : cell;
}

/**
 * The row's label tier, read off the `bgcolor` the first cell carries.
 *
 * `gray` is the tables' marker for a defunct race, which is a different fact
 * from a label and is returned separately — a defunct race must never reach the
 * backlog, because spending a permanent slug (Rule 8) on a race that no longer
 * runs is unfixable.
 */
function labelOf(firstCell: string): { label: Label; defunct: boolean } {
  const m = firstCell.match(/bgcolor\s*=\s*"?([#\w]+)"?/i);
  if (!m) return { label: null, defunct: false };
  const colour = m[1].toLowerCase();
  if (colour === "gray" || colour === "grey") return { label: null, defunct: true };
  return { label: LABEL_BY_COLOUR[colour] ?? null, defunct: false };
}

function parsePage(
  wikitext: string,
  continent: string,
  page: string,
  unknown: Map<string, string>,
): RosterRace[] {
  // The Legend table comes first on every page and has the same colours in it,
  // so parsing from "Race list" onward is what stops the legend's own rows
  // being read as races.
  const start = wikitext.search(/==\s*Race list\s*==/i);
  const body = start >= 0 ? wikitext.slice(start) : wikitext;

  const races: RosterRace[] = [];
  for (const row of body.split(/\n\|-/).slice(1)) {
    const table = row.split(/\n\|\}/)[0];
    const cells = splitCells(table);
    if (cells.length < 3) continue;
    if (cells.some((c) => c.trimStart().startsWith("!"))) continue; // header row

    const { label, defunct } = labelOf(cells[0]);
    const content = cells.map(stripAttributes);

    const name = cleanDisplayName(stripMarkup(content[0]));
    if (!name || !/marathon|maraton|marathón|marató/i.test(name)) continue;
    if (defunct) continue;
    // `(1999)` in the name column is the tables' other defunct marker.
    if (/\(\s*(19|20)\d{2}\s*\)\s*$/.test(stripMarkup(content[0]))) continue;

    const city = stripMarkup(content[1]);
    const codeMatch = cells[2]?.match(/\{\{([A-Za-z]{2,4})\}\}/);
    const template = codeMatch?.[1]?.toUpperCase() ?? "";
    const countryCode = COUNTRY_TEMPLATE[template] ?? "";
    if (!countryCode) {
      if (template) unknown.set(template, name);
      continue;
    }

    const monthWord = stripMarkup(content[3] ?? "").toLowerCase().split(/[^a-z]/)[0];
    const inceptionRaw = stripMarkup(content[4] ?? "").match(/(19|20)\d{2}/);

    races.push({
      raceSlug: proposeCourseSlug(name),
      name,
      city,
      countryCode,
      countryName: COUNTRY_NAMES[countryCode] ?? countryCode,
      month: MONTHS[monthWord] ?? null,
      inception: inceptionRaw ? Number(inceptionRaw[0]) : null,
      label,
      // Bold is the tables' World Marathon Majors marker.
      isMajor: /'''/.test(content[0]),
      websiteUrl: firstUrl(cells[cells.length - 1] ?? ""),
      continent,
      wikiPage: page,
    });
  }
  return races;
}

// ------------------------------------------------------------------ main

async function fetchWikitext(page: string): Promise<string> {
  const url =
    `${API}?action=parse&page=${encodeURIComponent(page)}` +
    `&prop=wikitext&format=json&formatversion=2`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${page}`);
  const body = (await res.json()) as { parse?: { wikitext?: string }; error?: { info: string } };
  if (body.error) throw new Error(`${page}: ${body.error.info}`);
  const text = body.parse?.wikitext;
  if (!text) throw new Error(`${page}: no wikitext in the response`);
  return text;
}

const HEADER = [
  "raceSlug", "name", "city", "countryCode", "countryName",
  "month", "inception", "label", "isMajor", "websiteUrl", "continent", "wikiPage",
] as const;

async function main(argv: string[]): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const onlyRaw = flagValue(argv, "--only");
  const only = onlyRaw ? new Set(onlyRaw.split(",").map((s) => s.trim())) : null;

  const pages = Object.entries(PAGES).filter(([k]) => !only || only.has(k));
  if (pages.length === 0) throw new Error(`--only matched no page (have: ${Object.keys(PAGES).join(", ")})`);

  const unknown = new Map<string, string>();
  const races: RosterRace[] = [];
  mkdirSync(RAW_DIR, { recursive: true });

  for (const [continent, page] of pages) {
    const wikitext = await fetchWikitext(page);
    writeFileSync(join(RAW_DIR, `wikipedia-${continent}.wikitext`), wikitext);
    const found = parsePage(wikitext, continent, page, unknown);
    races.push(...found);
    console.log(`  ${continent.padEnd(14)} ${String(found.length).padStart(4)} races`);
    await sleep(REQUEST_DELAY_MS);
  }

  // One race per slug. A race listed on two continent pages (Istanbul is on
  // both Europe and Asia, and it is the same race) keeps the labelled copy.
  const bySlug = new Map<string, RosterRace>();
  for (const r of races) {
    const prior = bySlug.get(r.raceSlug);
    if (!prior || (prior.label === null && r.label !== null)) bySlug.set(r.raceSlug, r);
  }
  const unique = [...bySlug.values()].sort((a, b) => a.raceSlug.localeCompare(b.raceSlug));

  const tiers = unique.reduce<Record<string, number>>((acc, r) => {
    const k = r.label ?? "unlabelled";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\n${unique.length} distinct races across ${new Set(unique.map((r) => r.countryCode)).size} countries`,
  );
  console.log(`  ${Object.entries(tiers).map(([k, v]) => `${v} ${k}`).join(" · ")}`);
  console.log(`  ${unique.filter((r) => r.websiteUrl).length} carry an organizer URL`);

  if (unknown.size > 0) {
    console.log(
      `\n${unknown.size} unmapped country template(s) — add to COUNTRY_TEMPLATE, ` +
        `these races were skipped:`,
    );
    for (const [code, example] of unknown) console.log(`    {{${code}}}  e.g. ${example}`);
  }

  if (dryRun) {
    console.log("\ndry-run: no CSV written");
    return;
  }

  writeFileSync(
    ROSTER_CSV,
    toCsv(
      HEADER,
      unique.map((r) => [
        r.raceSlug, r.name, r.city, r.countryCode, r.countryName,
        r.month === null ? "" : String(r.month),
        r.inception === null ? "" : String(r.inception),
        r.label ?? "", r.isMajor ? "yes" : "", r.websiteUrl, r.continent, r.wikiPage,
      ]),
    ),
  );
  console.log(`\nwrote ${ROSTER_CSV}`);
  console.log("next: npm run import:backlog");
}

/**
 * Read the roster back. backlog.ts is the only consumer.
 *
 * Reads the committed CSV rather than re-crawling, so `import:backlog` stays
 * offline and re-runnable — the crawl is a separate, deliberate step.
 */
export function loadRoster(): RosterRace[] {
  if (!existsSync(ROSTER_CSV)) return [];
  const rows = parseCsv(readFileSync(ROSTER_CSV, "utf8")).filter((r) => r.length >= HEADER.length);
  const header = rows.shift();
  if (!header || header[0] !== HEADER[0]) return [];
  const col = (r: string[], name: (typeof HEADER)[number]) => r[HEADER.indexOf(name)] ?? "";
  return rows.map((r) => ({
    raceSlug: col(r, "raceSlug"),
    name: col(r, "name"),
    city: col(r, "city"),
    countryCode: col(r, "countryCode"),
    countryName: col(r, "countryName"),
    month: col(r, "month") ? Number(col(r, "month")) : null,
    inception: col(r, "inception") ? Number(col(r, "inception")) : null,
    label: (col(r, "label") || null) as Label,
    isMajor: col(r, "isMajor") === "yes",
    websiteUrl: col(r, "websiteUrl"),
    continent: col(r, "continent"),
    wikiPage: col(r, "wikiPage"),
  }));
}

if (process.argv[1]?.endsWith("roster.ts")) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
