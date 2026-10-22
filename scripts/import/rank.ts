// Reach scoring for the import backlog (ROADMAP #23).
//
// Not a command. backlog.ts calls score() for every row it writes.
//
// The problem this solves: the backlog is roughly 900 races and no session is
// going to work it alphabetically. Row order in the findmymarathon CSV is by
// date, which means a session starting at the top spends its whole budget on
// January's small-town races while Osaka and Cape Town sit unworked. Ranking by
// reach is what lets a session take the top twenty and stop.
//
// Every signal here is offline and cheap. That is deliberate: ranking 900 rows
// must not cost 900 web requests, or nobody will re-rank and the order will go
// stale the moment the backlog changes.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { IMPORT_DIR, parseCsv } from "./shared.ts";
import { SERIES_SEED } from "../../src/db/seed/series.ts";
import { CITY_SEED } from "../../src/db/seed/cities.ts";

const CITIES_CSV = join(IMPORT_DIR, "reach", "cities.csv");

export interface RankInput {
  city: string;
  countryCode: string;
  /** World Athletics label tier, from the roster. */
  label: "platinum" | "gold" | "elite" | "label" | null;
  isMajor: boolean;
  /** Next known race date, ISO. Null when the source publishes none. */
  nextDate: string | null;
  inception: number | null;
  /** Latest finisher count, from findmymarathon. Absent for the other feeders. */
  finishers?: number | null;
}

export interface RankResult {
  score: number;
  /** Why it scored that, in one line, so a wrong ranking is debuggable. */
  basis: string;
}

// ------------------------------------------------------------- population

interface CityRow {
  countryCode: string;
  population: number;
}

let cityIndex: Map<string, CityRow> | null = null;

/** Accent- and case-insensitive, so "Málaga" and "Malaga" are one key. */
function cityKey(country: string, name: string): string {
  return `${country.toUpperCase()}:${name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()}`;
}

function loadCities(): Map<string, CityRow> {
  if (cityIndex) return cityIndex;
  const index = new Map<string, CityRow>();
  let rows: string[][] = [];
  try {
    rows = parseCsv(readFileSync(CITIES_CSV, "utf8"));
  } catch {
    // Ranking degrades to label-and-coverage rather than failing. The file is
    // committed, so this only fires on a fresh checkout mid-refresh.
    cityIndex = index;
    return index;
  }
  for (const r of rows.slice(1)) {
    if (r.length < 5) continue;
    const [name, asciiName, countryCode, , population] = r;
    const pop = Number(population);
    if (!Number.isFinite(pop)) continue;
    for (const n of [name, asciiName]) {
      const key = cityKey(countryCode, n);
      const prior = index.get(key);
      // Two cities of the same name in one country: the larger one wins, which
      // is the right guess for "which Springfield hosts a marathon".
      if (!prior || prior.population < pop) index.set(key, { countryCode, population: pop });
    }
  }
  cityIndex = index;
  return index;
}

/**
 * Population of the host city, or null.
 *
 * The city field arrives in several shapes across the three feeders:
 * `"Bend"`, `"Chicago, Illinois"`, `"Hopkinton to Boston, Massachusetts"`,
 * `"Folsom to Sacramento"`. A point-to-point race reaches the city it finishes
 * in, so the candidates are tried finish-first.
 */
export function populationOf(city: string, countryCode: string): number | null {
  const index = loadCities();
  const candidates: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !candidates.includes(t)) candidates.push(t);
  };

  push(city);
  const parts = city.split(",").map((p) => p.trim());
  // "A to B, State" -> try "B" before "A": the finish is the host city.
  for (const part of parts) {
    const legs = part.split(/\s+(?:to|-|–|—)\s+/);
    for (const leg of legs.reverse()) push(leg);
  }

  for (const c of candidates) {
    const hit = index.get(cityKey(countryCode, c));
    if (hit) return hit.population;
  }
  return null;
}

// ---------------------------------------------------------------- coverage

let seededByCountry: Map<string, number> | null = null;

/**
 * How many courses we already seed in a country.
 *
 * Read from the seed files rather than hardcoded, so the deficit bonus shrinks
 * on its own as a country fills up. Computed from SERIES_SEED joined to
 * CITY_SEED, because a series names a city slug and only the city knows its
 * country.
 */
function coverageByCountry(): Map<string, number> {
  if (seededByCountry) return seededByCountry;
  const country = new Map(CITY_SEED.map((c) => [c.slug, c.countryCode]));
  const counts = new Map<string, number>();
  for (const s of SERIES_SEED) {
    const cc = country.get(s.citySlug);
    if (!cc) continue;
    counts.set(cc, (counts.get(cc) ?? 0) + 1);
  }
  seededByCountry = counts;
  return counts;
}

// ------------------------------------------------------------------ score

/** Points for a World Athletics label, or a World Marathon Major. */
const LABEL_POINTS = { platinum: 36, gold: 30, elite: 24, label: 18 } as const;

const MONTH_MS = 30.44 * 24 * 3600 * 1000;

export function score(input: RankInput, today = new Date()): RankResult {
  const parts: string[] = [];
  let total = 0;

  // --- 1. Stature, 0-40 ---------------------------------------------------
  // The strongest single signal and the cheapest: a World Athletics label is
  // awarded on field size, elite participation, timing and course
  // certification, which is exactly the bundle "how many runners is this"
  // means. It comes free out of the roster's row colours.
  if (input.isMajor) {
    total += 40;
    parts.push("major +40");
  } else if (input.label) {
    total += LABEL_POINTS[input.label];
    parts.push(`${input.label} +${LABEL_POINTS[input.label]}`);
  } else if (input.finishers) {
    // No label, but findmymarathon counted the field: that IS the size signal
    // a label stands in for. Log-scaled and capped below a gold label, so 50
    // finishers earns nothing, 500 earns 16, 1,000 earns 21 and 5,000+ the
    // full 30. Before this every findmymarathon row scored 0 here and the US
    // regional races ranked by city population alone, which put a 60-runner
    // race in a big city above a 4,000-runner race in a small one.
    const pts = Math.round(Math.min(30, Math.max(0, (Math.log10(input.finishers) - 1.7) * 16)));
    if (pts > 0) {
      total += pts;
      parts.push(`${input.finishers} finishers +${pts}`);
    }
  }

  // --- 2. Host city population, 0-30 -------------------------------------
  // Log-scaled, because the difference between a 100k city and a 1M city
  // matters far more than between 5M and 6M. 100k scores 7.5, 1M scores 22.5,
  // 3M and up saturates.
  const pop = populationOf(input.city, input.countryCode);
  if (pop !== null) {
    const pts = Math.round(Math.min(30, Math.max(0, (Math.log10(pop) - 4.5) * 15)));
    total += pts;
    parts.push(`pop ${(pop / 1e6).toFixed(pop >= 1e6 ? 1 : 2)}M +${pts}`);
  } else {
    parts.push("pop unknown +0");
  }

  // --- 3. Coverage deficit, 0-15 -----------------------------------------
  // Actively corrects the catalog's US/Italy skew instead of entrenching it.
  // A country we already cover well earns nothing here; a country with no
  // course at all earns the full bonus, because the first race in a country is
  // worth more to a runner there than the twentieth race in Ohio.
  //
  // An unknown country scores nothing here rather than the full bonus. A
  // rejected goandrace entry keeps no country (qa.ts writes no city block for
  // one), and treating "we don't know" as "we have none there" put 183 rows
  // near the top of the first ranking purely for being unlabelled.
  if (input.countryCode) {
    const seeded = coverageByCountry().get(input.countryCode) ?? 0;
    const deficit = Math.round(15 * (1 - Math.min(seeded, 10) / 10));
    total += deficit;
    parts.push(`${input.countryCode} has ${seeded} +${deficit}`);
  } else {
    parts.push("country unknown +0");
  }

  // --- 4. Date proximity, 0-10 -------------------------------------------
  // A race with a date inside the next twelve months needs no separate
  // still-runs check (the adopt-races skill already leans on this), so it is
  // cheaper to work as well as more useful to a runner searching today.
  if (input.nextDate) {
    const months = (new Date(input.nextDate).getTime() - today.getTime()) / MONTH_MS;
    if (months >= 0 && months <= 12) {
      total += 10;
      parts.push(`runs in ${Math.round(months)}mo +10`);
    } else if (months > 12 && months <= 24) {
      total += 5;
      parts.push("runs within 2y +5");
    } else {
      parts.push("date stale +0");
    }
  } else {
    parts.push("no date +0");
  }

  // --- 5. Longevity, 0-5 --------------------------------------------------
  // A race that has run for forty years is one people have heard of, and it is
  // also far more likely to still be running next year.
  if (input.inception !== null) {
    const age = today.getFullYear() - input.inception;
    const pts = age >= 40 ? 5 : age >= 20 ? 3 : age >= 10 ? 1 : 0;
    if (pts > 0) {
      total += pts;
      parts.push(`since ${input.inception} +${pts}`);
    }
  }

  return { score: Math.min(100, total), basis: parts.join(" · ") };
}
