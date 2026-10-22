// Great-circle distance, shared by everything that measures ground.
//
// This lived inside src/components/home/courseMapData.ts until the interactive
// course map (ROADMAP #22) needed it too, to walk an outline polyline and turn
// it into distance along the course. Two copies of a formula that decides where
// a kilometre marker lands is exactly the kind of thing that drifts silently,
// so it moved here and courseMapData re-exports it for its existing callers.

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
