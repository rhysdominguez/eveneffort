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

export interface CoursePinProperties {
  id: string;
  displayName: string;
  city: string;
  countryName: string;
  /** `YYYY-MM-DD` for the next scheduled edition, or null when none is booked. */
  nextRaceDateISO: string | null;
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
  Number.isFinite(c.cityLat) &&
  Number.isFinite(c.cityLon) &&
  Math.abs(c.cityLat) <= 90 &&
  Math.abs(c.cityLon) <= 180;

/**
 * The catalog as map pins, one per course, at its host city's coordinate.
 *
 * The city pin is deliberately used rather than `course.start`: two races in
 * one city share a city row (see the data model in CLAUDE.md), so pinning the
 * city is what makes them cluster into a single marker the way they should.
 *
 * Entries whose coordinates are missing or out of range are dropped rather
 * than plotted at null island — a course with bad coordinates should be
 * invisible on the map, not sitting in the Gulf of Guinea.
 */
export function coursesToGeoJSON(
  catalog: CourseSummary[],
): CoursePinCollection {
  return {
    type: "FeatureCollection",
    features: catalog.filter(isPlottable).map((c) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        // Longitude first. GeoJSON and MapLibre both want [lng, lat]; the
        // database and every human-facing label say lat/lon. This is the one
        // place the swap happens.
        coordinates: [c.cityLon, c.cityLat],
      },
      properties: {
        id: c.id,
        displayName: c.displayName,
        city: c.city,
        countryName: c.countryName,
        nextRaceDateISO: c.nextRaceDateISO,
      },
    })),
  };
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
    west = Math.min(west, c.cityLon);
    east = Math.max(east, c.cityLon);
    south = Math.min(south, c.cityLat);
    north = Math.max(north, c.cityLat);
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
 */
export function nearestCourse(
  catalog: CourseSummary[],
  lat: number,
  lon: number,
): { course: CourseSummary; distanceKm: number } | null {
  let best: { course: CourseSummary; distanceKm: number } | null = null;
  for (const course of catalog) {
    if (!isPlottable(course)) continue;
    const distanceKm = haversineKm(lat, lon, course.cityLat, course.cityLon);
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
export function pinDateLabel(props: CoursePinProperties): string {
  const formatted = props.nextRaceDateISO
    ? formatDateDisplay(props.nextRaceDateISO)
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

/**
 * The pin popup, as an HTML string.
 *
 * MapLibre popups take markup, not React children, so this is built by hand —
 * which is exactly why it lives in the pure module where its content can be
 * asserted. Every interpolated value is escaped: the strings come from the
 * database, and a race called "Rock 'n' Roll" would otherwise break the CTA's
 * attribute quoting.
 */
export function popupMarkup(props: CoursePinProperties): string {
  const title = escapeHtml(props.displayName);
  const place = escapeHtml(pinLocationLabel(props));
  const date = escapeHtml(pinDateLabel(props));
  const id = escapeHtml(props.id);
  return [
    `<div class="course-pin">`,
    `<p class="course-pin-title">${title}</p>`,
    `<p class="course-pin-meta">${place}</p>`,
    `<p class="course-pin-meta">${date}</p>`,
    `<button type="button" ${POPUP_COURSE_ATTR}="${id}" class="course-pin-cta">Build my paceband</button>`,
    `</div>`,
  ].join("");
}
