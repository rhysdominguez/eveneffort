import { describe, it, expect } from "vitest";
import type { EditionSummary } from "@/types";
import { FIXTURE_EDITIONS, FIXTURE_TODAY } from "@/data/editions.fixture";
import {
  ALL_LOCATIONS,
  continentOptions,
  countryOptions,
  filterEditions,
  isFiltered,
  locationLabel,
  regionOptions,
  selectContinent,
  selectCountry,
  selectRegion,
  upcomingSeriesCount,
} from "@/components/home/calendarFilters";
import { continentOf } from "@/lib/continents";

const slugs = (editions: EditionSummary[]) =>
  editions.map((e) => e.editionSlug);

const labels = (options: { label: string }[]) => options.map((o) => o.label);

describe("continentOf", () => {
  it("places the seeded catalogue's countries on the right continents", () => {
    expect(continentOf("US")).toBe("NA");
    expect(continentOf("MX")).toBe("NA"); // filed with the US, not South America
    expect(continentOf("IT")).toBe("EU");
    expect(continentOf("JP")).toBe("AS");
    expect(continentOf("ZA")).toBe("AF");
    expect(continentOf("AU")).toBe("OC");
    expect(continentOf("BR")).toBe("SA");
  });

  it("keeps the two codes that are also continent keys as countries", () => {
    expect(continentOf("AS")).toBe("OC"); // American Samoa, not Asia
    expect(continentOf("NA")).toBe("AF"); // Namibia, not North America
  });

  it("returns null for a code it doesn't know, rather than guessing", () => {
    expect(continentOf("ZZ")).toBeNull();
  });
});

describe("calendar location filter", () => {
  it("passes everything through when nothing is narrowed", () => {
    expect(isFiltered(ALL_LOCATIONS)).toBe(false);
    expect(filterEditions(FIXTURE_EDITIONS, ALL_LOCATIONS)).toBe(
      FIXTURE_EDITIONS,
    );
  });

  it("narrows to a continent", () => {
    const filter = selectContinent("EU");
    expect(slugs(filterEditions(FIXTURE_EDITIONS, filter))).toEqual([
      "berlin-marathon-2026",
      "london-marathon-2026",
    ]);
  });

  it("narrows to a country, and keeps every edition of it", () => {
    const filter = selectCountry(ALL_LOCATIONS, "US");
    expect(slugs(filterEditions(FIXTURE_EDITIONS, filter))).toEqual([
      "boston-marathon-2026",
      "chicago-marathon-2026",
    ]);
  });

  it("pins the continent when a country is chosen, so the selects agree", () => {
    expect(selectCountry(ALL_LOCATIONS, "JP").continent).toBe("AS");
  });

  it("clears the narrower levels when the continent changes", () => {
    const usa = selectRegion(selectCountry(ALL_LOCATIONS, "US"), "US-MA");
    const europe = selectContinent("EU");
    expect(usa.regionCode).toBe("US-MA");
    expect(europe).toEqual({
      continent: "EU",
      countryCode: null,
      regionCode: null,
    });
  });

  it("narrows to a state inside a country", () => {
    const filter = selectRegion(selectCountry(ALL_LOCATIONS, "US"), "US-IL");
    expect(slugs(filterEditions(FIXTURE_EDITIONS, filter))).toEqual([
      "chicago-marathon-2026",
    ]);
  });

  it("counts races, not editions", () => {
    // Two editions of one series must count once — the calendar seeds this
    // year and next for nearly every race.
    const twice: EditionSummary[] = [
      ...FIXTURE_EDITIONS,
      { ...FIXTURE_EDITIONS[2], editionSlug: "berlin-marathon-2027" },
    ];
    const germany = countryOptions(twice, "EU").find((o) => o.value === "DE");
    expect(germany?.count).toBe(1);
  });

  it("orders continents geographically and lists only ones with races", () => {
    expect(labels(continentOptions(FIXTURE_EDITIONS))).toEqual([
      "Asia",
      "Europe",
      "North America",
      "Oceania",
    ]);
  });

  it("files a country the table doesn't know under Elsewhere, last", () => {
    const unknown: EditionSummary = {
      ...FIXTURE_EDITIONS[0],
      editionSlug: "atlantis-marathon-2026",
      seriesSlug: "atlantis-marathon",
      countryCode: "ZZ",
      countryName: "Atlantis",
    };
    const options = continentOptions([...FIXTURE_EDITIONS, unknown]);
    expect(labels(options).at(-1)).toBe("Elsewhere");
    expect(
      slugs(filterEditions([...FIXTURE_EDITIONS, unknown], selectContinent("other"))),
    ).toEqual(["atlantis-marathon-2026"]);
  });

  it("scopes the country list to the chosen continent", () => {
    expect(labels(countryOptions(FIXTURE_EDITIONS, "EU"))).toEqual([
      "Germany",
      "United Kingdom",
    ]);
    expect(labels(countryOptions(FIXTURE_EDITIONS, null))).toEqual([
      "Australia",
      "Germany",
      "Japan",
      "United Kingdom",
      "United States",
    ]);
  });

  it("offers states only where a country has more than one", () => {
    expect(labels(regionOptions(FIXTURE_EDITIONS, "US") ?? [])).toEqual([
      "Illinois",
      "Massachusetts",
    ]);
    // One race, one state — a select with a single option is furniture.
    expect(regionOptions(FIXTURE_EDITIONS, "AU")).toBeNull();
    // No subdivisions recorded at all, which is the case outside US/CA/AU.
    expect(regionOptions(FIXTURE_EDITIONS, "DE")).toBeNull();
    expect(regionOptions(FIXTURE_EDITIONS, null)).toBeNull();
  });

  it("describes the filter the way the summary line reads it", () => {
    expect(locationLabel(FIXTURE_EDITIONS, ALL_LOCATIONS)).toBe("");
    expect(locationLabel(FIXTURE_EDITIONS, selectContinent("EU"))).toBe(
      "Europe",
    );
    expect(
      locationLabel(FIXTURE_EDITIONS, selectCountry(ALL_LOCATIONS, "US")),
    ).toBe("United States");
    expect(
      locationLabel(
        FIXTURE_EDITIONS,
        selectRegion(selectCountry(ALL_LOCATIONS, "US"), "US-MA"),
      ),
    ).toBe("Massachusetts, United States");
  });

  it("counts only races still to come, once each", () => {
    // Boston (2026-04-20) is behind FIXTURE_TODAY; the other five are ahead.
    expect(upcomingSeriesCount(FIXTURE_EDITIONS, FIXTURE_TODAY)).toBe(5);
    expect(
      upcomingSeriesCount(
        filterEditions(FIXTURE_EDITIONS, selectCountry(ALL_LOCATIONS, "US")),
        FIXTURE_TODAY,
      ),
    ).toBe(1);
  });
});
