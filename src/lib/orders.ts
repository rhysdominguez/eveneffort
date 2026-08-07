// Printed-paceband offer: pricing, copy constants, and the Stripe Checkout
// Session shape. Deliberately free of any `stripe` import so it stays pure and
// unit-testable — the route handler is the only place the SDK is touched.
//
// This is a smoke test (Lean Startup sense): there is no order database. The
// Checkout Session's `metadata` IS the order record — `resultsUrl` is the link
// we reopen to print the exact band the runner paid for. See docs/FULFILLMENT.md.
import type { PacingInput } from "@/types";
import { buildResultsQuery } from "@/lib/resultsParams";
import { formatHMS } from "@/lib/units/time";

export const PACEBAND_PRICE_CENTS = 999;
export const PACEBAND_PRICE_LABEL = "$9.99";
export const PACEBAND_CURRENCY = "usd";

/** Business days between payment and the band going in the post. */
export const FULFILLMENT_WINDOW = "3–5 business days";

/**
 * US only to start with. Postage abroad more than doubles and every band is
 * hand-made, so widen this only once demand shows where it actually is.
 */
export const SHIPPING_COUNTRIES = ["US"] as const;

/** Max characters for the optional name printed on the band. */
export const NAME_ON_BAND_MAX = 20;

export const SUPPORT_EMAIL = "morenog150@gmail.com";

/** Everything the customer is promised, in one place so no surface drifts. */
export const PACEBAND_PRODUCT = {
  name: "eveneffort printed paceband",
  priceLabel: PACEBAND_PRICE_LABEL,
  blurb:
    "Waterproof, tear-resistant, and cut to wrap your wrist — your exact splits, printed and mailed to you.",
  shipping: "Free shipping, US only.",
  fulfillment: `Hand-made and mailed within ${FULFILLMENT_WINDOW}.`,
} as const;

/**
 * Stripe metadata caps values at 500 characters; a results URL with weather,
 * body metrics and fueling all set is nowhere near that, but truncating beats
 * a rejected session.
 */
const METADATA_VALUE_MAX = 500;

function clamp(value: string): string {
  return value.slice(0, METADATA_VALUE_MAX);
}

export interface CheckoutSessionParams {
  mode: "payment";
  line_items: { price: string; quantity: number }[];
  shipping_address_collection: { allowed_countries: readonly string[] };
  custom_fields: {
    key: string;
    label: { type: "custom"; custom: string };
    type: "text";
    optional: true;
    text: { maximum_length: number };
  }[];
  metadata: Record<string, string>;
  success_url: string;
  cancel_url: string;
}

/**
 * Build the Checkout Session payload for one paceband order.
 *
 * @param input  Already validated server-side — never trust the raw client body.
 * @param origin Absolute site origin, e.g. "https://eveneffort.com".
 * @param priceId Stripe Price ID for the $9.99 paceband.
 * @param courseName Display name, resolved from the database by the caller.
 *   Passed in rather than looked up here so this module stays pure and
 *   synchronous — the course table is behind an async server-only query.
 */
export function buildCheckoutSessionParams(
  input: PacingInput,
  origin: string,
  priceId: string,
  courseName: string,
): CheckoutSessionParams {
  const query = buildResultsQuery(input);
  const resultsUrl = `${origin}/results?${query}`;

  return {
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
    custom_fields: [
      {
        key: "name_on_band",
        label: { type: "custom", custom: "Name to print on the band" },
        type: "text",
        optional: true,
        text: { maximum_length: NAME_ON_BAND_MAX },
      },
    ],
    metadata: {
      courseId: input.courseId,
      courseName: clamp(courseName),
      unit: input.unit,
      goalTime: formatHMS(input.goalTimeSeconds),
      resultsUrl: clamp(resultsUrl),
    },
    // Stripe substitutes {CHECKOUT_SESSION_ID}; the braces must survive intact.
    success_url: `${origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: resultsUrl,
  };
}
