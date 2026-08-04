import { describe, it, expect } from "vitest";
import { buildCheckoutSessionParams, SHIPPING_COUNTRIES } from "./orders";
import { parseResultsParams } from "./resultsParams";
import type { PacingInput } from "@/types";

const ORIGIN = "https://eveneffort.com";
const PRICE_ID = "price_test_123";

const baseInput: PacingInput = {
  courseId: "boston",
  unit: "km",
  goalTimeSeconds: 10800, // 3:00:00
};

describe("buildCheckoutSessionParams", () => {
  it("charges the configured price once, US shipping only", () => {
    const params = buildCheckoutSessionParams(baseInput, ORIGIN, PRICE_ID);
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([{ price: PRICE_ID, quantity: 1 }]);
    expect(params.shipping_address_collection.allowed_countries).toEqual(
      SHIPPING_COUNTRIES,
    );
  });

  it("offers an optional name-on-band field", () => {
    const { custom_fields } = buildCheckoutSessionParams(
      baseInput,
      ORIGIN,
      PRICE_ID,
    );
    expect(custom_fields).toHaveLength(1);
    expect(custom_fields[0].key).toBe("name_on_band");
    expect(custom_fields[0].optional).toBe(true);
  });

  it("records a human-readable order summary in metadata", () => {
    const { metadata } = buildCheckoutSessionParams(
      baseInput,
      ORIGIN,
      PRICE_ID,
    );
    expect(metadata.courseId).toBe("boston");
    expect(metadata.courseName).toBe("Boston Marathon");
    expect(metadata.goalTime).toBe("3:00:00");
    expect(metadata.unit).toBe("km");
  });

  it("keeps every metadata value inside Stripe's 500-char cap", () => {
    // The heaviest possible input: weather, body metrics and fueling all set.
    const fat: PacingInput = {
      ...baseInput,
      raceDateISO: "2026-04-20",
      raceStartTime: "09:00",
      weather: { tempC: 21, humidity: 68, windSpeed: 4.5, windDirection: 270 },
      body: { massKg: 72.5, heightCm: 180 },
      fueling: { carbsPerHour: 60 },
    };
    const { metadata } = buildCheckoutSessionParams(fat, ORIGIN, PRICE_ID);
    for (const value of Object.values(metadata)) {
      expect(value.length).toBeLessThanOrEqual(500);
    }
    expect(Object.keys(metadata).length).toBeLessThanOrEqual(50);
  });

  it("stores a resultsUrl that round-trips back to the same input", () => {
    const input: PacingInput = {
      ...baseInput,
      unit: "miles",
      weather: { tempC: 18, humidity: 55, windSpeed: 3, windDirection: 90 },
      fueling: { carbsPerHour: 75 },
    };
    const { metadata } = buildCheckoutSessionParams(input, ORIGIN, PRICE_ID);

    const url = new URL(metadata.resultsUrl);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/results");

    const reparsed = parseResultsParams(
      Object.fromEntries(url.searchParams),
    );
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(reparsed.input).toEqual(input);
  });

  it("returns to the same results page on cancel and to /order/success on payment", () => {
    const params = buildCheckoutSessionParams(baseInput, ORIGIN, PRICE_ID);
    expect(params.cancel_url).toBe(params.metadata.resultsUrl);
    // Stripe substitutes the placeholder — it must survive verbatim.
    expect(params.success_url).toBe(
      `${ORIGIN}/order/success?session_id={CHECKOUT_SESSION_ID}`,
    );
  });
});
