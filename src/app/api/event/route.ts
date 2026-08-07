// Counts the in-app funnel steps for the paceband smoke test by writing a
// single JSON line per event to the server log (readable in Vercel's log view
// or a drain). No storage, no identifiers, no third party — see lib/analytics.ts.
// Must stay in step with the event names lib/analytics.ts emits: anything not
// listed here is silently dropped.
const ALLOWED = new Set([
  "print_modal_opened",
  "order_modal_opened",
  "order_clicked",
]);

export async function POST(request: Request): Promise<Response> {
  try {
    const { event } = (await request.json()) as { event?: unknown };
    if (typeof event === "string" && ALLOWED.has(event)) {
      console.log(
        JSON.stringify({ type: "app_event", event, ts: new Date().toISOString() }),
      );
    }
  } catch {
    // A malformed beacon is not worth a 4xx: nothing downstream depends on it.
  }
  return new Response(null, { status: 204 });
}
