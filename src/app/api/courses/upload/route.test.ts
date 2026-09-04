// @vitest-environment node
//
// Node, not jsdom: this route reads multipart with request.formData(), and
// jsdom's fetch shims do not carry a File through a Request body. Same opt-out
// src/lib/weather/forecast.live.test.ts uses, for the same class of reason.
// Guards the upload gate. Every dependency that would reach outside the
// process — the database, the DEM provider — is stubbed, so these run with no
// network and no connection string (CLAUDE.md Rule 9).
//
// The cases worth having are the rejections: this is an unauthenticated route
// that writes rows and can call a metered third-party API, so what it REFUSES
// is more load-bearing than what it accepts.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const isDatabaseConfigured = vi.fn(() => true);
vi.mock("@/db/client", () => ({
  isDatabaseConfigured: () => isDatabaseConfigured(),
}));

const insertUserCourse = vi.fn();
const countRecentUploads = vi.fn<(hash: string) => Promise<number>>();
vi.mock("@/db/userCourses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/userCourses")>();
  return {
    ...actual,
    insertUserCourse: (geometry: unknown, creatorHash: unknown) =>
      insertUserCourse(geometry, creatorHash),
    countRecentUploads: (hash: string) => countRecentUploads(hash),
  };
});

const fillElevationDecimated = vi.fn();
vi.mock("@/lib/course/decimate", () => ({
  fillElevationDecimated: (points: unknown) => fillElevationDecimated(points),
}));

import { POST } from "./route";
import { MAX_UPLOAD_BYTES } from "@/lib/course/uploadRules";

const GPX_DIR = join(process.cwd(), "data", "gpx_sources");
const berlin = () => readFileSync(join(GPX_DIR, "berlin.gpx"));

/**
 * A single-track GPX of a given length: a straight eastbound line at the
 * equator. Synthetic because the catalog only contains courses that PASSED the
 * distance gate, and the rejection is the thing worth testing.
 */
function straightGpx(totalKm: number, points = 500, name?: string): string {
  const degPerPoint = totalKm / 111.19492664455873 / (points - 1);
  const trkpts = Array.from(
    { length: points },
    (_, i) =>
      `<trkpt lat="0.0000000" lon="${(i * degPerPoint).toFixed(7)}"><ele>10.0</ele></trkpt>`,
  ).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">` +
    `<trk>${name ? `<name>${name}</name>` : ""}<trkseg>${trkpts}</trkseg></trk></gpx>`
  );
}

function post(
  file: { name: string; body: Buffer | string } | null,
  fields: Record<string, string> = {},
  headers: Record<string, string> = {},
): Request {
  const form = new FormData();
  if (file) {
    form.set("file", new File([new Uint8Array(Buffer.from(file.body))], file.name));
  }
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request("https://eveneffort.com/api/courses/upload", {
    method: "POST",
    body: form,
    headers,
  });
}

describe("POST /api/courses/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDatabaseConfigured.mockReturnValue(true);
    countRecentUploads.mockResolvedValue(0);
    insertUserCourse.mockResolvedValue({
      token: "u-abcdefghijklmnopqrstuv",
      expiresAt: new Date("2026-12-03T00:00:00Z"),
    });
  });

  it("accepts a real course file and returns an id that is a valid course slug", async () => {
    const res = await POST(post({ name: "berlin.gpx", body: berlin() }, { name: "My Berlin" }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.courseId).toMatch(/^u-[a-z0-9]{22}$/);
    // The whole design rests on this id travelling through the existing
    // /results and checkout paths untouched.
    expect(data.courseId).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
    expect(data.name).toBe("My Berlin");
    expect(data.elevationSource).toBe("gpx");
    expect(data.distanceKm).toBeGreaterThan(42);
    expect(fillElevationDecimated).not.toHaveBeenCalled();
  });

  it("says the feature is off rather than erroring when there is no database", async () => {
    isDatabaseConfigured.mockReturnValue(false);
    const res = await POST(post({ name: "berlin.gpx", body: berlin() }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("not set up");
  });

  it("refuses a route that is not marathon length, and says what it measured", async () => {
    // A 48 km single-track route — the trail-ultra case, and the single most
    // likely wrong upload.
    const res = await POST(post({ name: "ultra.gpx", body: straightGpx(48) }));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toMatch(/48\.0/);
    expect(error).toMatch(/43\.6/);
    expect(insertUserCourse).not.toHaveBeenCalled();
  });

  it("refuses a multi-track file rather than silently joining the pieces", async () => {
    // Two copies end to end: flattening them would invent a route.
    const res = await POST(
      post({ name: "double.gpx", body: Buffer.concat([berlin(), berlin()]) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/track/);
    expect(insertUserCourse).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a route at all", async () => {
    const res = await POST(post({ name: "notes.json", body: '{"hello":"world"}' }));
    expect(res.status).toBe(400);
    expect(insertUserCourse).not.toHaveBeenCalled();
  });

  it("refuses an extension it does not handle", async () => {
    const res = await POST(post({ name: "activity.fit", body: berlin() }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("GPX");
  });

  it("refuses a file over the size cap before parsing it", async () => {
    const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x20);
    const res = await POST(post({ name: "huge.gpx", body: huge }));
    expect(res.status).toBe(413);
    expect(insertUserCourse).not.toHaveBeenCalled();
  });

  it("refuses when no file was chosen", async () => {
    const res = await POST(post(null));
    expect(res.status).toBe(400);
  });

  it("rate limits by client, before any parsing or DEM call", async () => {
    countRecentUploads.mockResolvedValue(10);
    const res = await POST(
      post({ name: "berlin.gpx", body: berlin() }, {}, { "x-forwarded-for": "203.0.113.7" }),
    );
    expect(res.status).toBe(429);
    expect(insertUserCourse).not.toHaveBeenCalled();
    expect(fillElevationDecimated).not.toHaveBeenCalled();
  });

  it("prefers the name inside the file over the filename", async () => {
    const res = await POST(post({ name: "blue-ridge.gpx", body: berlin() }));
    expect(res.status).toBe(200);
    // berlin.gpx carries <name>BMW Berlin Marathon 2024 - 42.195 km</name>,
    // truncated to the paceband's width budget.
    expect((await res.json()).name).toBe("BMW Berlin Marathon 2024 - 42.195 km");
  });

  it("falls back to the filename when the file names nothing", async () => {
    const res = await POST(post({ name: "blue-ridge_marathon.gpx", body: straightGpx(42.2) }));
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("blue ridge marathon");
  });

  it("falls back to UTC rather than trusting an unusable timezone", async () => {
    await POST(post({ name: "berlin.gpx", body: berlin() }, { timezone: "Mars/Olympus" }));
    expect(insertUserCourse.mock.calls[0][0].timezone).toBe("UTC");
  });

  it("keeps a valid timezone", async () => {
    await POST(post({ name: "berlin.gpx", body: berlin() }, { timezone: "Europe/Berlin" }));
    expect(insertUserCourse.mock.calls[0][0].timezone).toBe("Europe/Berlin");
  });

  it("stores 44 elevations and 44 coords, the shape the engine requires", async () => {
    await POST(post({ name: "berlin.gpx", body: berlin() }));
    const geometry = insertUserCourse.mock.calls[0][0];
    expect(geometry.elevations).toHaveLength(44);
    expect(geometry.coords).toHaveLength(44);
    expect(geometry.profile.length).toBeGreaterThan(100);
  });

  it("does not record a creator hash when there is no forwarded address", async () => {
    await POST(post({ name: "berlin.gpx", body: berlin() }));
    expect(insertUserCourse.mock.calls[0][1]).toBeNull();
  });
});
