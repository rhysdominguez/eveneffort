import type { CourseSummary } from "@/types";
import { formatDateDisplay } from "@/lib/units/date";

// Pure data layer for the course map. Everything here is DOM-free and
// WebGL-free on purpose: `CourseMap.tsx` cannot be unit tested (jsdom has no
// WebGL context, so constructing a MapLibre map throws), so every decision
// worth asserting — coordinate order, bounds, nearest-race, popup content —
// lives in this module instead, and the component stays a thin wrapper.

/** Coordinates as GeoJSON orders them: longitude first. */
export type LngLat = [number, number];

/** `[[west, south], [east, north]]` — MapLibre's `LngLatBoundsLike` tuple form. */
export type Bounds = [LngLat, LngLat];

/** One race listed inside a pin's popup. */
export interface PinRace {
  id: string;
  displayName: string;
  /** `YYYY-MM-DD` for the next scheduled edition, or null when none is booked. */
  nextRaceDateISO: string | null;
}

export interface CoursePinProperties {
  /** The start line this pin sits on, as `"lon,lat"` — its stable identity. */
  startKey: string;
  city: string;
  countryName: string;
  /**
   * JSON-encoded `PinRace[]`, never the array itself. Feature properties make
   * a round trip through MapLibre before a click handler reads them back, and
   * only primitives survive that intact — a nested array comes back already
   * stringified. Encoding it here makes the shape the same on both sides
   * instead of something that only misbehaves in the browser.
   */
  races: string;
}

export interface CoursePinFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: LngLat };
  properties: CoursePinProperties;
}

export interface CoursePinCollection {
  type: "FeatureCollection";
  features: CoursePinFeature[];
}

const isPlottable = (c: CourseSummary): boolean =>
  Number.isFinite(c.start.lat) &&
  Number.isFinite(c.start.lon) &&
  Math.abs(c.start.lat) <= 90 &&
  Math.abs(c.start.lon) <= 180;

/**
 * Groups races that begin at the very same point. Rare now that pins use each
 * race's own start line, but two races CAN genuinely share a start (a marathon
 * and a variant setting off together), and coincident features are exactly
 * what the map cannot render — so they are still merged into one pin.
 */
const pinKey = (c: CourseSummary): string => `${c.start.lon},${c.start.lat}`;

/**
 * The catalog as map pins, each at the race's OWN GPX start line.
 *
 * It used to pin the host city instead, on the reasoning that races in one
 * city should share a marker. That was wrong twice over. A city's coordinate
 * IS one host race's start line — the first one seeded, and a second race
 * never repoints it (see the data model in CLAUDE.md) — so in all eight cities
 * with two races, the first sat at exactly 0 km from the pin and the second
 * was drawn 2-16 km from where it actually starts (Lisbon Marathon was the
 * worst, at 16.1 km). And because both then held identical coordinates, they
 * stacked exactly: MapLibre drew a "2" cluster, clicking it only zoomed, and
 * coincident points never separate at any zoom — so the second race was
 * unreachable and only one popup could ever open.
 *
 * Starts fix both at once. Every pin is where its race truly begins, and races
 * in one city sit kilometres apart, so they cluster when zoomed out and pull
 * cleanly apart when zoomed in. The 292 courses that are the only race in
 * their city do not move at all: their city coordinate was already their own
 * start line.
 *
 * Entries whose coordinates are missing or out of range are dropped rather
 * than plotted at null island — a course with bad coordinates should be
 * invisible on the map, not sitting in the Gulf of Guinea.
 */
export function coursesToGeoJSON(
  catalog: CourseSummary[],
): CoursePinCollection {
  // Insertion order is catalog order (the query sorts by series name), so the
  // races inside a shared pin come out in a stable, alphabetical order.
  const byStart = new Map<string, CourseSummary[]>();
  for (const c of catalog) {
    if (!isPlottable(c)) continue;
    const existing = byStart.get(pinKey(c));
    if (existing) existing.push(c);
    else byStart.set(pinKey(c), [c]);
  }

  return {
    type: "FeatureCollection",
    features: [...byStart].map(([startKey, races]) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        // Longitude first. GeoJSON and MapLibre both want [lng, lat]; the
        // database and every human-facing label say lat/lon. This is the one
        // place the swap happens.
        coordinates: [races[0].start.lon, races[0].start.lat],
      },
      properties: {
        startKey,
        city: races[0].city,
        countryName: races[0].countryName,
        races: JSON.stringify(
          races.map(
            (c): PinRace => ({
              id: c.id,
              displayName: c.displayName,
              nextRaceDateISO: c.nextRaceDateISO,
            }),
          ),
        ),
      },
    })),
  };
}

/** The races on a pin, decoded from the property `coursesToGeoJSON` encoded. */
export function pinRaces(props: CoursePinProperties): PinRace[] {
  try {
    const parsed: unknown = JSON.parse(props.races);
    return Array.isArray(parsed) ? (parsed as PinRace[]) : [];
  } catch {
    return [];
  }
}

/**
 * Bounding box covering every plottable course, for the opening `fitBounds`.
 * Null when nothing is plottable, which is the caller's cue to skip the map.
 *
 * No antimeridian handling: the catalog spans Sydney to Chicago, so the naive
 * box is the whole world either way. Revisit only if the catalog ever narrows
 * to a Pacific-straddling set, where this would fit the long way round.
 */
export function boundsOf(catalog: CourseSummary[]): Bounds | null {
  const points = catalog.filter(isPlottable);
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const c of points) {
    west = Math.min(west, c.start.lon);
    east = Math.max(east, c.start.lon);
    south = Math.min(south, c.start.lat);
    north = Math.max(north, c.start.lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres between two lat/lon points. */
export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) *
      Math.cos(toRadians(bLat)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The course closest to a point, with its distance — what "Near me" reports
 * once it has the runner's location. Null when nothing is plottable.
 *
 * Measured to the start line, like the pins, and for the same reason: a race
 * whose city coordinate belongs to a different race in that city could
 * otherwise be reported at a distance it isn't, and with the displacements
 * running up to 16 km that is enough to name the wrong nearest race.
 */
export function nearestCourse(
  catalog: CourseSummary[],
  lat: number,
  lon: number,
): { course: CourseSummary; distanceKm: number } | null {
  let best: { course: CourseSummary; distanceKm: number } | null = null;
  for (const course of catalog) {
    if (!isPlottable(course)) continue;
    const distanceKm = haversineKm(lat, lon, course.start.lat, course.start.lon);
    if (best === null || distanceKm < best.distanceKm) {
      best = { course, distanceKm };
    }
  }
  return best;
}

/**
 * Place name under the race title: "Boston, United States". Takes only the
 * two fields it needs, so the band's accessible race list can call it with a
 * `CourseSummary` directly.
 */
export function pinLocationLabel(
  props: Pick<CoursePinProperties, "city" | "countryName">,
): string {
  return `${props.city}, ${props.countryName}`;
}

/**
 * Date line for a pin: the next scheduled edition, or an honest placeholder.
 * `formatDateDisplay` is reused rather than `Intl` so the string is identical
 * in every locale and testable — see the rules atop `src/lib/units/date.ts`.
 */
export function pinDateLabel(race: Pick<PinRace, "nextRaceDateISO">): string {
  const formatted = race.nextRaceDateISO
    ? formatDateDisplay(race.nextRaceDateISO)
    : "";
  return formatted || "Next date to be confirmed";
}

/** Escape for interpolation into the popup's HTML string. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The attribute the popup's CTA carries; the map reads it via delegation. */
export const POPUP_COURSE_ATTR = "data-course-id";

/** One race's name, date and CTA — repeated per race on a shared pin. */
function raceMarkup(race: PinRace): string {
  const name = escapeHtml(race.displayName);
  const date = escapeHtml(pinDateLabel(race));
  const id = escapeHtml(race.id);
  return [
    `<div class="course-pin-race">`,
    `<p class="course-pin-title">${name}</p>`,
    `<p class="course-pin-meta">${date}</p>`,
    `<button type="button" ${POPUP_COURSE_ATTR}="${id}" class="course-pin-cta">Build my paceband</button>`,
    `</div>`,
  ].join("");
}

/**
 * The pin popup, as an HTML string.
 *
 * MapLibre popups take markup, not React children, so this is built by hand —
 * which is exactly why it lives in the pure module where its content can be
 * asserted. Every interpolated value is escaped: the strings come from the
 * database, and a race called "Rock 'n' Roll" would otherwise break the CTA's
 * attribute quoting.
 *
 * A pin is a city, so it can carry more than one race. With one it reads as a
 * race card — name, place, date. With several the place is stated once at the
 * top and each race gets its own name, date and CTA below it, because that is
 * the only way the extra races are reachable at all (see `coursesToGeoJSON`).
 */
export function popupMarkup(props: CoursePinProperties): string {
  const place = escapeHtml(pinLocationLabel(props));
  const races = pinRaces(props);

  if (races.length === 1) {
    const race = races[0];
    return [
      `<div class="course-pin">`,
      `<p class="course-pin-title">${escapeHtml(race.displayName)}</p>`,
      `<p class="course-pin-meta">${place}</p>`,
      `<p class="course-pin-meta">${escapeHtml(pinDateLabel(race))}</p>`,
      `<button type="button" ${POPUP_COURSE_ATTR}="${escapeHtml(race.id)}" class="course-pin-cta">Build my paceband</button>`,
      `</div>`,
    ].join("");
  }

  return [
    `<div class="course-pin">`,
    `<p class="course-pin-place">${place}</p>`,
    ...races.map(raceMarkup),
    `</div>`,
  ].join("");
}
