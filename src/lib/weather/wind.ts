// Wind (headwind/tailwind) pace adjustment from an aerodynamic-drag model (Phase 2).
//
// Headwinds cost more than equal tailwinds help, because drag grows with the
// square of relative air speed. We compute, per segment: the direction of
// travel (bearing), the along-travel wind component (at runner height), the
// resulting drag force, and finally a metabolic-cost multiplier.
import type { BodyMetrics, Segment, WeatherConditions } from "@/types";
import { MARATHON_KM } from "@/lib/pacing/segments";
import { frontalArea } from "./bsa";

// Sea-level standard pressure and specific gas constant for dry air; density
// is derived from temperature via the ideal gas law (15 °C → 1.225 kg/m³).
const SEA_LEVEL_PRESSURE_PA = 101325;
const GAS_CONSTANT_DRY_AIR = 287.05; // J·kg⁻¹·K⁻¹
const DRAG_COEFFICIENT = 0.8; // C_d for a runner
const GRAVITY = 9.81; // m/s²
// Wind-profile power law: station height 10 m → runner height 1.5 m, α = 0.30.
const STATION_HEIGHT_M = 10;
const RUNNER_HEIGHT_M = 1.5;
const WIND_PROFILE_ALPHA = 0.3;
// Metabolic cost rises ~6.13 % per 1 % of bodyweight of impeding force.
const COST_PER_PCT_BODYWEIGHT = 0.0613;

/**
 * Air density (kg/m³) at sea-level pressure for a given air temperature (°C),
 * via the ideal gas law: ρ = P / (R·T). 15 °C gives the ISA standard 1.225;
 * warm race-day air is measurably thinner (≈ −5 % at 30 °C), reducing drag.
 */
export function airDensityKgM3(tempC: number): number {
  return SEA_LEVEL_PRESSURE_PA / (GAS_CONSTANT_DRY_AIR * (273.15 + tempC));
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Initial great-circle bearing (degrees, 0–360, 0 = north) from point 1 to 2.
 */
export function segmentBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Scale a 10 m station wind speed down to runner height (1.5 m) via the wind
 * profile power law with an urban/suburban exponent (α ≈ 0.30).
 */
export function windAtRunnerHeight(windSpeed10m: number): number {
  return (
    windSpeed10m * (RUNNER_HEIGHT_M / STATION_HEIGHT_M) ** WIND_PROFILE_ALPHA
  );
}

/**
 * Along-travel wind component (m/s). Positive = headwind (slows you), negative
 * = tailwind. `windFromDirection` is meteorological — the direction the wind
 * blows FROM — so a pure headwind occurs when travel bearing == wind direction.
 */
export function headwindComponent(
  travelBearing: number,
  windFromDirection: number,
  windSpeedRunner: number,
): number {
  return windSpeedRunner * Math.cos(toRad(travelBearing - windFromDirection));
}

// Signed drag force (N) along the direction of motion: positive impedes the
// runner, negative aids. F = 0.5·ρ·C_d·A_p·v_rel·|v_rel| keeps drag's sign.
function signedDrag(
  vRel: number,
  frontalAreaM2: number,
  airDensity: number,
): number {
  return (
    0.5 *
    airDensity *
    DRAG_COEFFICIENT *
    frontalAreaM2 *
    vRel *
    Math.abs(vRel)
  );
}

/**
 * Metabolic-cost multiplier (≈1) for one segment given the runner's ground
 * speed and the wind. The still-air drag the runner already overcomes is
 * subtracted so zero wind returns exactly 1.0; only the wind-induced *delta*
 * in impeding force is converted to cost. The quadratic drag preserves the
 * headwind-hurts-more-than-tailwind-helps asymmetry.
 */
export function windMultiplier(
  body: BodyMetrics,
  runnerSpeedMS: number,
  travelBearing: number,
  windSpeed10m: number,
  windFromDirection: number,
  tempC: number = 15,
): number {
  if (runnerSpeedMS <= 0) return 1;
  const Ap = frontalArea(body.massKg, body.heightCm);
  const rho = airDensityKgM3(tempC);
  const windRunner = windAtRunnerHeight(windSpeed10m);
  const headwind = headwindComponent(
    travelBearing,
    windFromDirection,
    windRunner,
  );

  const vRel = runnerSpeedMS + headwind;
  const bodyWeightN = body.massKg * GRAVITY;

  // Force as a fraction of bodyweight, still-air baseline subtracted.
  const pctRel = signedDrag(vRel, Ap, rho) / bodyWeightN;
  const pctStill = signedDrag(runnerSpeedMS, Ap, rho) / bodyWeightN;

  // pct values are fractions of bodyweight; ×100 converts to "% bodyweight",
  // matching the 6.13 %-cost-per-1 %-bodyweight empirical constant.
  return 1 + COST_PER_PCT_BODYWEIGHT * (pctRel - pctStill) * 100;
}

/**
 * Interpolate a [lat, lon] coordinate at an arbitrary distance (km) from the
 * 44-point coordinate array (mirrors interpolateElevation's index mapping:
 * index i = km i for i = 0..42; index 43 = the 42.195 km finish).
 */
export function coordAt(
  coords: [number, number][],
  distanceKm: number,
): [number, number] {
  if (distanceKm <= 0) return coords[0];
  if (distanceKm >= MARATHON_KM) return coords[43];
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  if (distanceKm <= 42) {
    const lower = Math.floor(distanceKm);
    if (lower === distanceKm) return coords[lower];
    const frac = distanceKm - lower;
    return [
      lerp(coords[lower][0], coords[lower + 1][0], frac),
      lerp(coords[lower][1], coords[lower + 1][1], frac),
    ];
  }
  const frac = (distanceKm - 42) / (MARATHON_KM - 42);
  return [
    lerp(coords[42][0], coords[43][0], frac),
    lerp(coords[42][1], coords[43][1], frac),
  ];
}

/**
 * Build the per-segment wind multipliers for a course. `segmentSpeedsMS[i]` is
 * the runner's elevation-adjusted ground speed for segment i, and
 * `weatherBySegment[i]` the conditions at the time the runner passes through
 * it (hourly-sampled). Returns an array aligned 1:1 with `segments`.
 */
export function buildWindMultipliers(
  segments: Segment[],
  coords: [number, number][],
  body: BodyMetrics,
  segmentSpeedsMS: number[],
  weatherBySegment: WeatherConditions[],
): number[] {
  return segments.map((seg, i) => {
    const [lat1, lon1] = coordAt(coords, seg.startDistanceKm);
    const [lat2, lon2] = coordAt(coords, seg.endDistanceKm);
    const bearing = segmentBearing(lat1, lon1, lat2, lon2);
    const weather = weatherBySegment[i];
    return windMultiplier(
      body,
      segmentSpeedsMS[i],
      bearing,
      weather.windSpeed,
      weather.windDirection,
      weather.tempC,
    );
  });
}
