// Host cities, keyed by slug. Edit this file (or bulk-append to it) to add
// places; `npm run db:seed` upserts by slug, so re-running is safe.
//
// `latitude`/`longitude` are seeded from the host race's actual GPX start
// line (coords[0] in src/data/courses/<slug>.coords.json) — exact, not a
// guessed city centroid. There is still exactly ONE point per city: if a
// second marathon is later added in a city that's already seeded here, its
// own start line does NOT overwrite this row — the existing point keeps
// serving as that city's single shared map pin. Only add a second city row
// (e.g. a distinct metro area) if the events are genuinely in different
// places; don't repoint an existing city to a second race's start line.
//
// `regionCode` is ISO 3166-2. Null is legitimate for city-states and for
// countries whose subdivision doesn't mean anything to a runner.

export interface CitySeed {
  slug: string;
  name: string;
  countryCode: string;
  countryName: string;
  regionCode: string | null;
  regionName: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
}

export const CITY_SEED: CitySeed[] = [
  {
    slug: "berlin-de",
    name: "Berlin",
    countryCode: "DE",
    countryName: "Germany",
    regionCode: "DE-BE",
    regionName: "Berlin",
    latitude: 52.51521,
    longitude: 13.360292,
    timezone: "Europe/Berlin",
  },
  {
    slug: "chicago-il-us",
    name: "Chicago",
    countryCode: "US",
    countryName: "United States",
    regionCode: "US-IL",
    regionName: "Illinois",
    latitude: 41.881001,
    longitude: -87.620645,
    timezone: "America/Chicago",
  },
  {
    slug: "london-gb",
    name: "London",
    countryCode: "GB",
    countryName: "United Kingdom",
    regionCode: "GB-LND",
    regionName: "Greater London",
    latitude: 51.47309,
    longitude: 0.01158,
    timezone: "Europe/London",
  },
  {
    slug: "tokyo-jp",
    name: "Tokyo",
    countryCode: "JP",
    countryName: "Japan",
    regionCode: "JP-13",
    regionName: "Tokyo",
    latitude: 35.689939,
    longitude: 139.692341,
    timezone: "Asia/Tokyo",
  },
  {
    slug: "sydney-nsw-au",
    name: "Sydney",
    countryCode: "AU",
    countryName: "Australia",
    regionCode: "AU-NSW",
    regionName: "New South Wales",
    latitude: -33.833204,
    longitude: 151.208004,
    timezone: "Australia/Sydney",
  },
  {
    slug: "new-york-ny-us",
    name: "New York",
    countryCode: "US",
    countryName: "United States",
    regionCode: "US-NY",
    regionName: "New York",
    latitude: 40.601905,
    longitude: -74.059344,
    timezone: "America/New_York",
  },
  {
    slug: "boston-ma-us",
    name: "Boston",
    countryCode: "US",
    countryName: "United States",
    regionCode: "US-MA",
    regionName: "Massachusetts",
    latitude: 42.22975,
    longitude: -71.518245,
    timezone: "America/New_York",
  },
];
