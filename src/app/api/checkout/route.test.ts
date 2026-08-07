// Guards the failure modes of the order route. The money path itself lives in
// Stripe, so the SDK and the course lookup are both stubbed — these tests must
// pass with no network and no database (CLAUDE.md Rule 9).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const create = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create } };
  },
}));

const getCourseBySlug = vi.fn();
vi.mock("@/db/queries", () => ({
  getCourseBySlug: (slug: string) => getCourseBySlug(slug),
}));

import { POST } from "./route";

const VALID_PARAMS = "courseId=boston&unit=km&goalTimeSeconds=10800";

function post(body: unknown, raw?: string): Request {
  return new Request("https://eveneffort.com/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

describe("POST /api/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRICE_ID = "price_test_123";
    process.env.NEXT_PUBLIC_SITE_URL = "https://eveneffort.com";
    getCourseBySlug.mockResolvedValue({ displayName: "Boston Marathon" });
    create.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay/abc" });
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("degrades to 503 when Stripe is not configured, pointing at the free path", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await POST(post({ params: VALID_PARAMS }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/print at home/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 503 when the price ID is missing", async () => {
    delete process.env.STRIPE_PRICE_ID;
    const res = await POST(post({ params: VALID_PARAMS }));
    expect(res.status).toBe(503);
  });

  it("rejects a malformed body", async () => {
    const res = await POST(post(null, "{not json"));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a missing or empty params string", async () => {
    for (const body of [{}, { params: "" }, { params: 42 }]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects params the results parser will not accept", async () => {
    const res = await POST(post({ params: "courseId=boston&unit=furlongs" }));
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses to charge for a course that is not in the catalog", async () => {
    getCourseBySlug.mockResolvedValue(undefined);
    const res = await POST(post({ params: VALID_PARAMS }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown course.");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a session and hands back its hosted URL", async () => {
    const res = await POST(post({ params: VALID_PARAMS }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.com/c/pay/abc",
    });

    const payload = create.mock.calls[0][0];
    expect(payload.line_items).toEqual([
      { price: "price_test_123", quantity: 1 },
    ]);
    expect(payload.metadata.courseName).toBe("Boston Marathon");
    // Same record on the payment, which is what fulfillment actually reads.
    expect(payload.payment_intent_data.metadata).toEqual(payload.metadata);
  });

  it("reports 502 when Stripe throws or returns no URL", async () => {
    create.mockResolvedValue({ url: null });
    expect((await POST(post({ params: VALID_PARAMS }))).status).toBe(502);

    create.mockRejectedValue(new Error("network down"));
    const res = await POST(post({ params: VALID_PARAMS }));
    expect(res.status).toBe(502);
    // The secret key must never leak into a client-visible error.
    expect(JSON.stringify(await res.json())).not.toContain("sk_test");
  });
});
