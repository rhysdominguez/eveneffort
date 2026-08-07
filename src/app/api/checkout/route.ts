// Creates a Stripe Checkout Session for a printed paceband order. Keeps
// STRIPE_SECRET_KEY server-side — the client only ever POSTs its results query
// string here and follows the returned hosted-checkout URL.
//
// Error discipline mirrors /api/weather: every failure is JSON + a distinct
// status, so the modal can show a useful message and the free Print path stays
// unaffected when payments are misconfigured or down.
import Stripe from "stripe";
import { parseResultsParams } from "@/lib/resultsParams";
import { buildCheckoutSessionParams } from "@/lib/orders";
import { getCourseBySlug } from "@/db/queries";

export async function POST(request: Request): Promise<Response> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!secretKey || !priceId) {
    return Response.json(
      { error: "Ordering is not set up yet. You can still print at home." },
      { status: 503 },
    );
  }

  let params: unknown;
  try {
    const body = await request.json();
    params = (body as { params?: unknown })?.params;
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  if (typeof params !== "string" || params.length === 0) {
    return Response.json({ error: "Missing pacing params." }, { status: 400 });
  }

  // Re-validate rather than trusting the client: the same parser the /results
  // page uses, so an order can only ever describe a band the app can render.
  const parsed = parseResultsParams(
    Object.fromEntries(new URLSearchParams(params)),
  );
  if (!parsed.ok) {
    return Response.json({ error: parsed.reason }, { status: 400 });
  }

  // The parser can only vouch for the slug's shape, so this lookup is what
  // proves the course exists — and it also supplies the display name that goes
  // on the order record. No course, no charge.
  const course = await getCourseBySlug(parsed.input.courseId);
  if (!course) {
    return Response.json({ error: "Unknown course." }, { status: 400 });
  }

  // NEXT_PUBLIC_SITE_URL pins the canonical origin (Stripe redirects back to
  // it); fall back to the request's own origin for local dev and previews.
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin;

  try {
    // Pinned, not left to Stripe's account default: an unpinned client silently
    // picks up API changes. This is the version stripe@22.4.0 was generated
    // against, so bump it only together with the package.
    const stripe = new Stripe(secretKey, { apiVersion: "2026-07-29.dahlia" });
    // orders.ts stays free of Stripe types so it can be unit-tested; the cast
    // is the single seam between our plain object and the SDK's enums.
    const session = await stripe.checkout.sessions.create(
      buildCheckoutSessionParams(
        parsed.input,
        origin,
        priceId,
        course.displayName,
      ) as unknown as Stripe.Checkout.SessionCreateParams,
    );

    if (!session.url) {
      return Response.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 },
      );
    }

    return Response.json({ url: session.url });
  } catch {
    return Response.json(
      { error: "Could not reach the payment provider." },
      { status: 502 },
    );
  }
}
