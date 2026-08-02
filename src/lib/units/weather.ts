// Display-unit conversion for the weather and body inputs.
//
// Everything is stored METRIC-CANONICAL and stays that way: the Minetti heat
// model reads °C, the drag model reads m/s and kg/cm, and the Tomorrow.io
// request is pinned to `units: "metric"`. These helpers convert only at the UI
// boundary, so the physics never sees a converted number.
//
// Units are chosen per field rather than by one global system. Two of them are
// inherited rather than independently toggled, because the alternative is
// incoherent: wind speed follows the distance unit (km ⇒ km/h, mi ⇒ mph), and
// height follows the weight unit (kg ⇒ cm, lb ⇒ in).
//
// Drift note: display values round to 1 decimal, but the canonical value is
// only rewritten when the user actually edits a field. Toggling units back and
// forth without editing therefore never accumulates rounding error.
import type { Unit } from "@/types";

export type TempUnit = "C" | "F";
export type SpeedUnit = "kph" | "mph";
export type WeightUnit = "kg" | "lb";
/** Imperial height is entered as feet + inches, not absolute inches. */
export type HeightUnit = "cm" | "ftin";

const MS_TO_KPH = 3.6;
const MS_TO_MPH = 2.236936; // 1 m/s in miles per hour
const KG_TO_LB = 2.20462262;
const CM_PER_INCH = 2.54;

/** Wind speed unit implied by the distance unit. */
export function speedUnitForDistance(unit: Unit): SpeedUnit {
  return unit === "km" ? "kph" : "mph";
}

const INCHES_PER_FOOT = 12;

/** Canonical °C → the displayed temperature. */
export function tempToDisplay(tempC: number, unit: TempUnit): number {
  return unit === "C" ? tempC : (tempC * 9) / 5 + 32;
}

/** A temperature the user typed → canonical °C. */
export function tempFromDisplay(value: number, unit: TempUnit): number {
  return unit === "C" ? value : ((value - 32) * 5) / 9;
}

/** Canonical m/s → the displayed wind speed. */
export function windToDisplay(windMS: number, unit: SpeedUnit): number {
  return windMS * (unit === "kph" ? MS_TO_KPH : MS_TO_MPH);
}

/** A wind speed the user typed → canonical m/s. */
export function windFromDisplay(value: number, unit: SpeedUnit): number {
  return value / (unit === "kph" ? MS_TO_KPH : MS_TO_MPH);
}

/** Canonical kg → the displayed body mass. */
export function massToDisplay(massKg: number, unit: WeightUnit): number {
  return unit === "kg" ? massKg : massKg * KG_TO_LB;
}

/** A body mass the user typed → canonical kg. */
export function massFromDisplay(value: number, unit: WeightUnit): number {
  return unit === "kg" ? value : value / KG_TO_LB;
}

/**
 * Canonical cm → whole feet plus inches, the way height is actually spoken in
 * imperial ("5 ft 9", not "68.9 in"). Inches are rounded to the nearest whole
 * number, rolling over to the next foot at 12 so 182.7 cm reads 6′0″ rather
 * than the nonsensical 5′12″.
 */
export function cmToFeetInches(heightCm: number): {
  feet: number;
  inches: number;
} {
  if (!(heightCm > 0)) return { feet: 0, inches: 0 };
  const totalInches = heightCm / CM_PER_INCH;
  let feet = Math.floor(totalInches / INCHES_PER_FOOT);
  let inches = Math.round(totalInches - feet * INCHES_PER_FOOT);
  if (inches >= INCHES_PER_FOOT) {
    feet += 1;
    inches -= INCHES_PER_FOOT;
  }
  return { feet, inches };
}

/** Feet + inches the user typed → canonical cm. */
export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH;
}

export function tempUnitLabel(unit: TempUnit): string {
  return unit === "C" ? "°C" : "°F";
}

export function windUnitLabel(unit: SpeedUnit): string {
  return unit === "kph" ? "km/h" : "mph";
}

export function heightUnitLabel(unit: HeightUnit): string {
  return unit === "cm" ? "cm" : "ft";
}

/** Round to the nearest whole number — every display field is integer-only. */
export function roundForDisplay(value: number): number {
  return Math.round(value);
}
