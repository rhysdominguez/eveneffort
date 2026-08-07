// Marathon series — the recurring brand, one row per race regardless of how
// many years it has been run. Editions (src/db/seed/editions.ts) hang off
// these by `slug`.
//
// `courseSlug` names the geometry file set in src/data/courses/ that this
// series currently runs on: <courseSlug>.json, <courseSlug>.coords.json and
// <courseSlug>.profile.json. These slugs are the pre-database course ids and
// must not be renamed — shared /results?courseId=... links depend on them.

export interface SeriesSeed {
  slug: string;
  name: string;
  citySlug: string;
  courseSlug: string;
  isMajor: boolean;
  /** 1-12. Shown as "usually September" before a date is confirmed. */
  typicalMonth: number;
  websiteUrl: string;
  organizer: string;
}

export const SERIES_SEED: SeriesSeed[] = [
  {
    slug: "berlin-marathon",
    name: "Berlin Marathon",
    citySlug: "berlin-de",
    courseSlug: "berlin",
    isMajor: true,
    typicalMonth: 9,
    websiteUrl: "https://www.bmw-berlin-marathon.com/",
    organizer: "SCC EVENTS",
  },
  {
    slug: "chicago-marathon",
    name: "Chicago Marathon",
    citySlug: "chicago-il-us",
    courseSlug: "chicago",
    isMajor: true,
    typicalMonth: 10,
    websiteUrl: "https://www.chicagomarathon.com/",
    organizer: "Chicago Event Management",
  },
  {
    slug: "london-marathon",
    name: "London Marathon",
    citySlug: "london-gb",
    courseSlug: "london",
    isMajor: true,
    typicalMonth: 4,
    websiteUrl: "https://www.tcslondonmarathon.com/",
    organizer: "London Marathon Events",
  },
  {
    slug: "tokyo-marathon",
    name: "Tokyo Marathon",
    citySlug: "tokyo-jp",
    courseSlug: "tokyo",
    isMajor: true,
    typicalMonth: 3,
    websiteUrl: "https://www.marathon.tokyo/en/",
    organizer: "Tokyo Marathon Foundation",
  },
  {
    slug: "sydney-marathon",
    name: "Sydney Marathon",
    citySlug: "sydney-nsw-au",
    courseSlug: "sydney",
    isMajor: true,
    typicalMonth: 8,
    websiteUrl: "https://www.sydneymarathon.org/",
    organizer: "Pont3",
  },
  {
    slug: "new-york-city-marathon",
    name: "New York City Marathon",
    citySlug: "new-york-ny-us",
    courseSlug: "newyork",
    isMajor: true,
    typicalMonth: 11,
    websiteUrl: "https://www.nyrr.org/tcsnycmarathon",
    organizer: "New York Road Runners",
  },
  {
    slug: "boston-marathon",
    name: "Boston Marathon",
    citySlug: "boston-ma-us",
    courseSlug: "boston",
    isMajor: true,
    typicalMonth: 4,
    websiteUrl: "https://www.baa.org/races/boston-marathon",
    organizer: "Boston Athletic Association",
  },
];
