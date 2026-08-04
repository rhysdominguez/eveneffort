// Minimal funnel instrumentation for the paceband smoke test. Vercel Web
// Analytics covers page views; these two events cover the in-app steps between
// a results view and a Stripe session:
//
//   /results view → print_modal_opened / order_modal_opened → order_clicked → (Stripe: session → paid)
//
// Deliberately crude — one fire-and-forget beacon to a route that logs a JSON
// line. No IDs, no PII, no dependency. Swap in a real analytics tool only once
// there is something worth analyzing.
"use client";

export type AppEvent =
  | "print_modal_opened"
  | "order_modal_opened"
  | "order_clicked";

/** Fire-and-forget: never blocks, never throws, never breaks the UI. */
export function track(event: AppEvent): void {
  try {
    const body = JSON.stringify({ event });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/event", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Instrumentation must never be load-bearing.
  }
}
