import { describe, it, expect } from "vitest";
import { buildCheckoutSessionParams, SHIPPING_COUNTRIES } from "./orders";
import { parseResultsParams } from "./resultsParams";
import type { PacingInput } from "@/types";

const ORIGIN = "https://eveneffort.com";
const PRICE_ID = "price_test_123";
// Resolved from the database by the route handler and passed in, so orders.ts
// stays pure and synchronous.
const COURSE_NAME = "Boston Marathon";

const baseInput: PacingInput = {
  courseId: "boston",
  unit: "km",
  goalTimeSeconds: 10800, // 3:00:00
};

describe("buildCheckoutSessionParams", () => {
  it("charges the configured price once, US shipping only", () => {
    const params = buildCheckoutSessionParams(
      baseInput,
      ORIGIN,
      PRICE_ID,
      COURSE_NAME,
    );
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([{ price: PRICE_ID, quantity: 1 }]);
    expect(params.shipping_address_collection.allowed_countries).toEqual(
      SHIPPING_COUNTRIES,
    );
  });

  it("records a human-readable order summary in metadata", () => {
    const { metadata } = buildCheckoutSessionParams(
      baseInput,
      ORIGIN,
      PRICE_ID,
      COURSE_NAME,
    );
    expect(metadata.courseId).toBe("boston");
    expect(metadata.courseName).toBe("Boston Marathon");
    expect(metadata.goalTime).toBe("3:00:00");
    expect(metadata.unit).toBe("km");
  });

  it("copies that summary onto the PaymentIntent so it shows on the payment", () => {
    // Fulfillment reads the dashboard's Payment page, which does not display
    // session metadata — without this copy resultsUrl is invisible there.
    const params = buildCheckoutSessionParams(
      baseInput,
      ORIGIN,
      PRICE_ID,
      COURSE_NAME,
    );
    expect(params.payment_intent_data.metadata).toEqual(params.metadata);
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
    const { metadata } = buildCheckoutSessionParams(
      fat,
      ORIGIN,
      PRICE_ID,
      COURSE_NAME,
    );
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
    const { metadata } = buildCheckoutSessionParams(
      input,
      ORIGIN,
      PRICE_ID,
      COURSE_NAME,
    );

    const url = new URL(metadata.resultsUrl);
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/results");

    const reparsed = parseResultsParams(Object.fromEntries(url.searchParams));
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(reparsed.input).toEqual(input);
  });

  it("returns to the same results page on cancel and to /order/success on payment", () => {
    const params = buildCheckoutSessionParams(
      baseInput,
      ORIGIN,
      PRICE_ID,
      COURSE_NAME,
    );
    expect(params.cancel_url).toBe(params.metadata.resultsUrl);
    // Stripe substitutes the placeholder — it must survive verbatim.
    expect(params.success_url).toBe(
      `${ORIGIN}/order/success?session_id={CHECKOUT_SESSION_ID}`,
    );
  });
});
