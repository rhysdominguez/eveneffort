// The race calendar's location filter, DOM-free so the whole cascade is unit
// testable — same split as calendarData.ts / courseMapData.ts.
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
import type { EditionSummary } from "@/types";
import {
  CONTINENT_CODES,
  CONTINENT_NAMES,
  type ContinentCode,
  continentOf,
} from "@/lib/continents";
import { subdivisionCode } from "@/lib/location";

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

const continentValueOf = (edition: EditionSummary): ContinentValue =>
  continentOf(edition.countryCode) ?? OTHER_CONTINENT;

/** Does one edition survive the filter? Each level is independent and ANDed. */
export function matchesLocation(
  edition: EditionSummary,
  filter: LocationFilter,
): boolean {
  if (filter.continent && continentValueOf(edition) !== filter.continent) {
    return false;
  }
  if (filter.countryCode && edition.countryCode !== filter.countryCode) {
    return false;
  }
  // A race with no recorded subdivision cannot match a state choice. It stays
  // reachable one level up, at its country — which is where it is filed.
  if (filter.regionCode && edition.regionCode !== filter.regionCode) {
    return false;
  }
  return true;
}

export function filterEditions(
  editions: EditionSummary[],
  filter: LocationFilter,
): EditionSummary[] {
  if (!isFiltered(filter)) return editions;
  return editions.filter((e) => matchesLocation(e, filter));
}

/**
 * Options for one select level. `key` buckets an edition; entries with no key
 * are skipped, and the count of each bucket is its distinct series.
 */
function optionsBy(
  editions: EditionSummary[],
  key: (e: EditionSummary) => { value: string; label: string } | null,
): FilterOption[] {
  const buckets = new Map<string, { label: string; series: Set<string> }>();
  for (const edition of editions) {
    const bucket = key(edition);
    if (!bucket) continue;
    const existing = buckets.get(bucket.value);
    if (existing) existing.series.add(edition.seriesSlug);
    else {
      buckets.set(bucket.value, {
        label: bucket.label,
        series: new Set([edition.seriesSlug]),
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
export function continentOptions(editions: EditionSummary[]): FilterOption[] {
  const options = optionsBy(editions, (e) => {
    const value = continentValueOf(e);
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
  editions: EditionSummary[],
  continent: ContinentValue | null,
): FilterOption[] {
  const scoped = continent
    ? editions.filter((e) => continentValueOf(e) === continent)
    : editions;
  return optionsBy(scoped, (e) => ({
    value: e.countryCode,
    label: e.countryName,
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
  editions: EditionSummary[],
  countryCode: string | null,
): FilterOption[] | null {
  if (!countryCode) return null;
  const options = optionsBy(
    editions.filter((e) => e.countryCode === countryCode),
    (e) =>
      e.regionCode
        ? {
            value: e.regionCode,
            // The name is what the option reads; the bare code is the fallback
            // for a city seeded with a code but no name, never "US-CA".
            label: e.regionName ?? subdivisionCode(e.regionCode),
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
 * Labels come from the matching editions rather than a lookup table, because
 * the country and region NAMES only exist in the data.
 */
export function locationLabel(
  editions: EditionSummary[],
  filter: LocationFilter,
): string {
  if (!isFiltered(filter)) return "";
  const match = editions.find((e) => matchesLocation(e, filter));

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
  editions: EditionSummary[],
  todayISO: string,
): number {
  const series = new Set<string>();
  for (const edition of editions) {
    if (edition.raceDateISO >= todayISO) series.add(edition.seriesSlug);
  }
  return series.size;
}
