// The dashboard's course-switch endpoint. getCourseBySlug is stubbed, so these
// pass with no database (CLAUDE.md Rule 9).
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCourseBySlug = vi.fn();
vi.mock("@/db/queries", () => ({
  getCourseBySlug: (slug: string) => getCourseBySlug(slug),
}));

import { GET } from "./route";

const BOSTON = {
  id: "boston",
  displayName: "Boston Marathon",
  elevations: Array.from({ length: 44 }, (_, i) => i),
  profile: [[0, 0]],
};

function get(slug: string): [Request, { params: Promise<{ slug: string }> }] {
  return [
    new Request(`https://eveneffort.com/api/courses/${slug}`),
    { params: Promise.resolve({ slug }) },
  ];
}

describe("GET /api/courses/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCourseBySlug.mockResolvedValue(BOSTON);
  });

  it("returns the full geometry for a known course", async () => {
    const res = await GET(...get("boston"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("boston");
    expect(body.elevations).toHaveLength(44);
    expect(getCourseBySlug).toHaveBeenCalledWith("boston");
  });

  it("rejects a malformed slug without touching the database", async () => {
    const res = await GET(...get("Boston Marathon!"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/malformed/i);
    expect(getCourseBySlug).not.toHaveBeenCalled();
  });

  it("404s a well-formed slug that resolves to nothing", async () => {
    getCourseBySlug.mockResolvedValue(null);
    const res = await GET(...get("not-a-real-race"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/unknown course/i);
  });

  // The `u-` prefix is routed inside getCourseBySlug, so this route needs no
  // branch of its own. This asserts it does not grow one.
  it("passes an uploaded course id straight through", async () => {
    getCourseBySlug.mockResolvedValue({ ...BOSTON, id: "u-abc123", isUserUpload: true });
    const res = await GET(...get("u-abc123"));
    expect(res.status).toBe(200);
    expect(getCourseBySlug).toHaveBeenCalledWith("u-abc123");
    expect((await res.json()).isUserUpload).toBe(true);
  });

  // An uploaded course can expire, and the seeded branch is already memoised
  // server-side, so a cached response here would be wrong in both directions.
  it("never lets the response be cached", async () => {
    const res = await GET(...get("boston"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
