// Client half of the paceband order flow. The redirect lives here rather than
// inline in PrintModal so the component stays testable in jsdom (which has no
// navigable location) — tests mock this module, not window.location.
"use client";

/**
 * Create a Checkout Session for the given results query string and send the
 * browser to Stripe's hosted page. Resolves only if navigation was started;
 * throws with a user-presentable message otherwise.
 */
export async function startCheckout(resultsQuery: string): Promise<void> {
  const response = await fetch("/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ params: resultsQuery }),
  });

  const data: { url?: string; error?: string } = await response
    .json()
    .catch(() => ({}));

  if (!response.ok || !data.url) {
    throw new Error(data.error ?? "Could not start checkout. Try again.");
  }

  window.location.assign(data.url);
}
