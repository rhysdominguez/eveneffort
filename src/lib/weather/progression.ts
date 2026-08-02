// Hourly weather progression across the race (Phase 2, Tier 1).
//
// A marathon spans ~2.5–6 hours; applying the start-line conditions to all
// 42 km systematically understates late-race heat. When a live hourly forecast
// is available it is used directly (one entry per hour from the start hour).
// For manual entry we synthesize a typical FALL RACE-MORNING progression:
//
//   - Temperature rises ~1.5 °C per hour. Mid-morning warming on clear fall
//     race days runs ~1.5–2.5 °C/h (diurnal-warming climatology; e.g. a Boston
//     race morning measured 53→65 °F from 8:50–11:15 am ≈ 2.7 °C/h under
//     strong April sun — fall sun is lower, so we take the conservative end).
//   - Relative humidity falls as the air warms: the absolute moisture content
//     (dew point) is roughly constant through a race morning, so RH is
//     recomputed from the dew point implied by the entered temp/RH pair
//     (Magnus formula) rather than guessed as a %-per-hour rate.
//   - Wind speed and direction are held constant — morning wind pickup is
//     site-specific and weakly predictable, so we do not invent it.
import type { WeatherConditions } from "@/types";

/** Assumed fall race-morning warming rate, °C per hour (see header). */
export const FALL_WARMING_C_PER_HOUR = 1.5;

// Magnus formula constants (Alduchov & Eskridge 1996), valid −40…+50 °C.
const MAGNUS_A = 17.625;
const MAGNUS_B = 243.04; // °C

/** Dew point (°C) from air temperature (°C) and relative humidity (%). */
export function dewPointC(tempC: number, humidity: number): number {
  const rh = Math.min(100, Math.max(1, humidity)); // guard ln(0)
  const gamma = Math.log(rh / 100) + (MAGNUS_A * tempC) / (MAGNUS_B + tempC);
  return (MAGNUS_B * gamma) / (MAGNUS_A - gamma);
}

/** Relative humidity (%) at temperature `tempC` for a fixed dew point (°C). */
export function humidityAtTemp(tempC: number, dewC: number): number {
  const rh =
    100 *
    Math.exp(
      (MAGNUS_A * dewC) / (MAGNUS_B + dewC) -
        (MAGNUS_A * tempC) / (MAGNUS_B + tempC),
    );
  return Math.min(100, Math.max(0, rh));
}

/**
 * Synthesize an hourly conditions series from manually entered start-line
 * conditions: `hours + 1` points (t = 0…hours), temp warming at the fall rate,
 * RH tracking the (constant) dew point, wind unchanged.
 */
export function synthesizeHourly(
  start: WeatherConditions,
  hours: number,
): WeatherConditions[] {
  const dew = dewPointC(start.tempC, start.humidity);
  return Array.from({ length: hours + 1 }, (_, h) => {
    const tempC = start.tempC + FALL_WARMING_C_PER_HOUR * h;
    return {
      tempC,
      humidity: humidityAtTemp(tempC, dew),
      windSpeed: start.windSpeed,
      windDirection: start.windDirection,
    };
  });
}

// Interpolate two wind directions along the shortest arc (e.g. 350°→10° passes
// through 0°, not 180°).
function lerpDirection(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

const lerp = (a: number, b: number, t: number): number => a + t * (b - a);

/**
 * Conditions at `elapsedSeconds` into the race, linearly interpolated between
 * consecutive hourly points (`hourly[i]` = i hours after the start), clamped
 * at both ends of the series.
 */
export function conditionsAtElapsed(
  hourly: WeatherConditions[],
  elapsedSeconds: number,
): WeatherConditions {
  if (hourly.length === 1) return hourly[0];
  const t = Math.min(Math.max(elapsedSeconds / 3600, 0), hourly.length - 1);
  const i = Math.min(Math.floor(t), hourly.length - 2);
  const frac = t - i;
  const a = hourly[i];
  const b = hourly[i + 1];
  return {
    tempC: lerp(a.tempC, b.tempC, frac),
    humidity: lerp(a.humidity, b.humidity, frac),
    windSpeed: lerp(a.windSpeed, b.windSpeed, frac),
    windDirection: lerpDirection(a.windDirection, b.windDirection, frac),
  };
}
