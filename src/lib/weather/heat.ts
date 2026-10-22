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

/**
 * The relative humidity the Heat/Humidity SPLIT is measured against: bone-dry
 * air. Presentation only. Nothing in the pacing engine reads it, and
 * `calculateHeatAdjustment` is untouched by its existence.
 *
 * The model has no humidity term to read: `heatIndexC` folds RH into a single
 * apparent temperature before any slowdown is computed, so "what humidity
 * costs" is not a quantity that exists until a baseline is named. Naming dry
 * air as the baseline makes the two lines mean something a runner can check:
 * Heat is what the air temperature alone would cost, and Humidity is what the
 * moisture adds on top of it.
 *
 * WHY 0 AND NOT A TYPICAL MORNING like 30 or 50 %. A non-zero reference makes
 * the humidity line NEGATIVE on any drier-than-reference day, which reads as
 * "the humidity is helping" when what actually happened is that the reference
 * was picked badly. At 0 the marginal is non-negative everywhere the model is
 * defined, and it behaves: negligible in cool air (0.1 % at 20 °C / 10 % RH),
 * dominant in a hot swamp (17 % at 32 °C / 95 % RH). The NWS formulae are
 * continuous and finite there, which `heat.test.ts` pins.
 */
export const DRY_REFERENCE_RH = 0;

/**
 * What the air temperature alone costs, with humidity held at the dry
 * reference. The Heat tile on the impact panel.
 *
 * Pairs with `humidityAdjustment` below so that
 * `dryHeatAdjustment(t) * humidityAdjustment(t, rh) === calculateHeatAdjustment(t, rh)`
 * exactly. That identity is the whole contract: the split is a way of READING
 * the existing multiplier, never a second model that could disagree with it.
 */
export function dryHeatAdjustment(tempC: number): number {
  return calculateHeatAdjustment(tempC, DRY_REFERENCE_RH);
}

/**
 * What the moisture adds on top of the temperature: the actual multiplier over
 * the dry-reference one. 1.0 in dry air, and 1.0 below the 13 °C threshold
 * where neither term does anything.
 */
export function humidityAdjustment(tempC: number, humidity: number): number {
  return calculateHeatAdjustment(tempC, humidity) / dryHeatAdjustment(tempC);
}
