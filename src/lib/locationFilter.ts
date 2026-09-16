// The catalogue's location filter, DOM-free so the whole cascade is unit
// testable — same split as calendarData.ts / courseMapData.ts.
//
// Generic over anything that carries a country, a region and a series slug, so
// the race calendar (editions) and the course rankings (courses) narrow by the
// SAME three levels with one implementation and one set of tests behind them.
// LocationFilterBar is the shared control that drives it.
//
// Three levels, narrowing: continent -> country -> state/region. That shape is
// forced by the catalogue rather than chosen for symmetry. It spans 60+
// countries, so a single flat country list is a scroll; and a third of the
// races are in one country (the US), so stopping at country leaves the biggest
// group unusable. The region level exists for exactly that case and hides
// itself everywhere else — see `regionOptions`.
//
// Counts are of SERIES, not editions. A series usually has two editions seeded
// (this year and next), and "Italy (42)" has to mean forty-two races, not
// twenty-one races counted twice.
import {
  CONTINENT_CODES,
  CONTINENT_NAMES,
  type ContinentCode,
  continentOf,
} from "@/lib/continents";
import { subdivisionCode } from "@/lib/location";

/**
 * The minimum a row needs to be filed under a place and counted.
 *
 * Structural rather than a union of EditionSummary | CourseSummary: the
 * filter genuinely does not care what else a row carries, and a new caller
 * should not have to be added to a type here to use it.
 */
export interface Locatable {
  /** What a count counts. One race, however many editions of it are in the list. */
  seriesSlug: string;
  countryCode: string;
  countryName: string;
  regionCode: string | null;
  regionName: string | null;
}

/** The "Elsewhere" bucket: races whose country the continent table lacks. */
export const OTHER_CONTINENT = "other";

export type ContinentValue = ContinentCode | typeof OTHER_CONTINENT;

export interface LocationFilter {
  continent: ContinentValue | null;
  countryCode: string | null;
  /** ISO 3166-2 subdivision code, only ever set alongside a country. */
  regionCode: string | null;
}

/** Everything, everywhere — what the calendar opens on. */
export const ALL_LOCATIONS: LocationFilter = {
  continent: null,
  countryCode: null,
  regionCode: null,
};

export interface FilterOption {
  value: string;
  label: string;
  /** Distinct series matching this option, under the filters above it. */
  count: number;
}

/** Has the visitor narrowed anything? Drives the "Clear" control. */
export function isFiltered(filter: LocationFilter): boolean {
  return (
    filter.continent !== null ||
    filter.countryCode !== null ||
    filter.regionCode !== null
  );
}

const continentValueOf = (row: Locatable): ContinentValue =>
  continentOf(row.countryCode) ?? OTHER_CONTINENT;

/** Does one row survive the filter? Each level is independent and ANDed. */
export function matchesLocation(
  row: Locatable,
  filter: LocationFilter,
): boolean {
  if (filter.continent && continentValueOf(row) !== filter.continent) {
    return false;
  }
  if (filter.countryCode && row.countryCode !== filter.countryCode) {
    return false;
  }
  // A race with no recorded subdivision cannot match a state choice. It stays
  // reachable one level up, at its country — which is where it is filed.
  if (filter.regionCode && row.regionCode !== filter.regionCode) {
    return false;
  }
  return true;
}

export function filterByLocation<T extends Locatable>(
  rows: T[],
  filter: LocationFilter,
): T[] {
  if (!isFiltered(filter)) return rows;
  return rows.filter((row) => matchesLocation(row, filter));
}

/**
 * Options for one select level. `key` buckets a row; entries with no key are
 * skipped, and the count of each bucket is its distinct series.
 */
function optionsBy(
  rows: Locatable[],
  key: (row: Locatable) => { value: string; label: string } | null,
): FilterOption[] {
  const buckets = new Map<string, { label: string; series: Set<string> }>();
  for (const row of rows) {
    const bucket = key(row);
    if (!bucket) continue;
    const existing = buckets.get(bucket.value);
    if (existing) existing.series.add(row.seriesSlug);
    else {
      buckets.set(bucket.value, {
        label: bucket.label,
        series: new Set([row.seriesSlug]),
      });
    }
  }
  return [...buckets].map(([value, { label, series }]) => ({
    value,
    label,
    count: series.size,
  }));
}

/**
 * Continents that actually hold a race, in a fixed geographic order rather
 * than by count — a list that reshuffles as races are imported is a list
 * nobody can build a habit on. "Elsewhere" always sits last.
 */
export function continentOptions(rows: Locatable[]): FilterOption[] {
  const options = optionsBy(rows, (row) => {
    const value = continentValueOf(row);
    return {
      value,
      label: value === OTHER_CONTINENT ? "Elsewhere" : CONTINENT_NAMES[value],
    };
  });
  const order = [...CONTINENT_CODES, OTHER_CONTINENT] as string[];
  return options.sort(
    (a, b) => order.indexOf(a.value) - order.indexOf(b.value),
  );
}

/** Countries inside the chosen continent (or all of them), A-Z by name. */
export function countryOptions(
  rows: Locatable[],
  continent: ContinentValue | null,
): FilterOption[] {
  const scoped = continent
    ? rows.filter((row) => continentValueOf(row) === continent)
    : rows;
  return optionsBy(scoped, (row) => ({
    value: row.countryCode,
    label: row.countryName,
  })).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * States/regions inside one country — or null, meaning "don't show this
 * select at all".
 *
 * Null is the answer almost everywhere: `regionCode` is only populated for the
 * countries whose city slugs carry a subdivision (US, CA, AU), and a select
 * offering a single option is furniture, not a filter. So this returns a list
 * only when a country is chosen AND that country has races in at least two
 * distinct regions, which is precisely when the country level stops being
 * specific enough to be useful.
 */
export function regionOptions(
  rows: Locatable[],
  countryCode: string | null,
): FilterOption[] | null {
  if (!countryCode) return null;
  const options = optionsBy(
    rows.filter((row) => row.countryCode === countryCode),
    (row) =>
      row.regionCode
        ? {
            value: row.regionCode,
            // The name is what the option reads; the bare code is the fallback
            // for a city seeded with a code but no name, never "US-CA".
            label: row.regionName ?? subdivisionCode(row.regionCode),
          }
        : null,
  ).sort((a, b) => a.label.localeCompare(b.label));
  return options.length >= 2 ? options : null;
}

/**
 * What that country calls its subdivisions. Canada has provinces, not states,
 * and a filter that says otherwise reads as written by someone who has never
 * been there. Anything not listed falls back to the neutral "region".
 */
export function regionNouns(countryCode: string | null): {
  label: string;
  allLabel: string;
} {
  switch (countryCode) {
    case "US":
    case "AU":
      return { label: "State", allLabel: "All states" };
    case "CA":
      return { label: "Province", allLabel: "All provinces" };
    default:
      return { label: "Region", allLabel: "All regions" };
  }
}

/**
 * Choosing a continent drops the narrower levels: keeping a country selected
 * under a continent it isn't in would filter everything away and read as a
 * broken calendar.
 */
export function selectContinent(value: ContinentValue | null): LocationFilter {
  return { continent: value, countryCode: null, regionCode: null };
}

/**
 * Choosing a country pins its continent too, so the two selects never
 * contradict each other — picking Japan from an unfiltered list has to leave
 * the continent select reading "Asia", not "All continents".
 */
export function selectCountry(
  filter: LocationFilter,
  value: string | null,
): LocationFilter {
  if (!value) return { ...filter, countryCode: null, regionCode: null };
  return {
    continent: continentOf(value) ?? OTHER_CONTINENT,
    countryCode: value,
    regionCode: null,
  };
}

export function selectRegion(
  filter: LocationFilter,
  value: string | null,
): LocationFilter {
  return { ...filter, regionCode: value };
}

/**
 * How the current filter reads in prose — "Texas, United States", "Italy",
 * "Europe" — for the summary line and the empty month's copy. Empty string
 * when nothing is narrowed, so callers can fall back to their own wording.
 *
 * Labels come from the matching rows rather than a lookup table, because the
 * country and region NAMES only exist in the data.
 */
export function locationLabel(
  rows: Locatable[],
  filter: LocationFilter,
): string {
  if (!isFiltered(filter)) return "";
  const match = rows.find((row) => matchesLocation(row, filter));

  if (filter.regionCode) {
    const region = match?.regionName ?? filter.regionCode;
    return match ? `${region}, ${match.countryName}` : region;
  }
  if (filter.countryCode) return match?.countryName ?? filter.countryCode;
  return filter.continent === OTHER_CONTINENT
    ? "Elsewhere"
    : CONTINENT_NAMES[filter.continent as ContinentCode];
}

/** Distinct races (series, not editions) still to come in a filtered list. */
export function upcomingSeriesCount(
  editions: (Locatable & { raceDateISO: string })[],
  todayISO: string,
): number {
  const series = new Set<string>();
  for (const edition of editions) {
    if (edition.raceDateISO >= todayISO) series.add(edition.seriesSlug);
  }
  return series.size;
}
