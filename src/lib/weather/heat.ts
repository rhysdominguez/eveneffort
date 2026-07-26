// Heat & humidity pace degradation (Phase 2).
//
// Marathon performance falls off as the apparent temperature (heat index)
// rises. We compute a continuous heat index from temperature + humidity, then
// map it to a percentage slowdown anchored on empirical marathon data
// (Davis / Running Writings): HI 16/21/27/32 °C ≈ 1/3/6/10 % slower. Below the
// 13 °C "ideal conditions" threshold, no adjustment is applied.

const HEAT_THRESHOLD_C = 13;

const cToF = (c: number): number => (c * 9) / 5 + 32;
const fToC = (f: number): number => ((f - 32) * 5) / 9;

/**
 * Continuous apparent temperature (heat index) in °C from air temperature (°C)
 * and relative humidity (%). Uses the NWS algorithm: the Steadman "simple"
 * formula for cooler conditions (which smoothly extends below the usual 27 °C
 * floor) and the Rothfusz regression with its low/high-humidity corrections
 * once the apparent temperature reaches ~80 °F.
 */
export function heatIndexC(tempC: number, humidity: number): number {
  const T = cToF(tempC);
  const RH = humidity;

  // Steadman simple approximation (valid and continuous for cooler conditions).
  const simple = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + RH * 0.094);

  // NWS uses the simple form until the average of it and T reaches 80 °F.
  if ((simple + T) / 2 < 80) {
    return fToC(simple);
  }

  // Rothfusz regression (°F).
  let hi =
    -42.379 +
    2.04901523 * T +
    10.14333127 * RH -
    0.22475541 * T * RH -
    0.00683783 * T * T -
    0.05481717 * RH * RH +
    0.00122874 * T * T * RH +
    0.00085282 * T * RH * RH -
    0.00000199 * T * T * RH * RH;

  if (RH < 13 && T >= 80 && T <= 112) {
    hi -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  } else if (RH > 85 && T >= 80 && T <= 87) {
    hi += ((RH - 85) / 10) * ((87 - T) / 5);
  }

  return fToC(hi);
}

// Empirical (heat index °C → fractional slowdown) anchors. Piecewise-linear
// between them, with extrapolation beyond the last anchor.
const ANCHORS: ReadonlyArray<[number, number]> = [
  [HEAT_THRESHOLD_C, 0.0],
  [16, 0.01],
  [21, 0.03],
  [27, 0.06],
  [32, 0.1],
];

/**
 * Fractional pace slowdown for a given heat index (°C). 0 at/below 13 °C;
 * piecewise-linear through the empirical anchors; linearly extrapolated using
 * the final segment's slope past 32 °C.
 */
export function slowdownFromHeatIndex(hiC: number): number {
  if (hiC <= ANCHORS[0][0]) return 0;
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x1, y1] = ANCHORS[i];
    if (hiC <= x1) {
      const [x0, y0] = ANCHORS[i - 1];
      return y0 + ((y1 - y0) * (hiC - x0)) / (x1 - x0);
    }
  }
  // Past the last anchor: extrapolate along the final segment's slope.
  const [xPrev, yPrev] = ANCHORS[ANCHORS.length - 2];
  const [xLast, yLast] = ANCHORS[ANCHORS.length - 1];
  const slope = (yLast - yPrev) / (xLast - xPrev);
  return yLast + slope * (hiC - xLast);
}

/**
 * Heat/humidity pace multiplier (≥ 1). Returns 1.0 when the air temperature is
 * at or below the 13 °C ideal-conditions threshold; otherwise 1 + slowdown,
 * where slowdown is derived from the computed heat index. e.g. 1.03 ⇒ 3 % slower.
 */
export function calculateHeatAdjustment(tempC: number, humidity: number): number {
  if (tempC <= HEAT_THRESHOLD_C) return 1.0;
  return 1 + slowdownFromHeatIndex(heatIndexC(tempC, humidity));
}
