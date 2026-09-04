// Accept a course file from a runner and turn it into a pageable course.
//
// The validation ladder below is the whole feature: everything downstream —
// /results, the chart, the splits, the printable band, checkout — is the
// existing code path, reached because an uploaded course id satisfies
// COURSE_SLUG_RE like any other. See docs/UPLOADED-COURSES.md.
//
// Every rejection carries the runner's ACTUAL problem. "Invalid file" is
// useless when the real answer is "this route measures 48.7 km and this tool
// builds marathon pacing charts" — so the parser's own message is passed
// through rather than flattened.
import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "@/db/client";
import {
  UPLOAD_RATE_LIMIT,
  countRecentUploads,
  insertUserCourse,
} from "@/db/userCourses";
import { fillElevationDecimated } from "@/lib/course/decimate";
import { lacksElevation } from "@/lib/course/elevate";
import { OPENTOPODATA } from "@/lib/course/dem";
import { CourseParseError, resampleCourse } from "@/lib/course/resample";
import {
  RouteError,
  assertSingleTrack,
  dedupe,
  parseRouteFile,
} from "@/lib/course/routeFile";
import {
  MAX_UPLOAD_BYTES,
  clientHash,
  hasAcceptedExtension,
  nameFromFilename,
  sanitizeCourseName,
} from "@/lib/course/uploadRules";

const bad = (error: string, status: number) => NextResponse.json({ error }, { status });

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  // Uploads are the one feature that genuinely cannot degrade without a
  // database — there is nowhere to put the course. Saying so plainly keeps
  // CLAUDE.md Rule 9 true: the build and the test suite never need a
  // connection string, and this route just reports that it is switched off.
  if (!isDatabaseConfigured()) {
    return bad("Course uploads are not set up yet.", 503);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Malformed upload.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return bad("Choose a course file to upload.", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return bad(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ` +
        `${MAX_UPLOAD_BYTES / 1024 / 1024} MB — a marathon course file is normally well under 1 MB.`,
      413,
    );
  }
  if (!hasAcceptedExtension(file.name)) {
    return bad("Upload a GPX, KML, KMZ or GeoJSON file.", 400);
  }

  // Rate limit before any parsing, and well before any DEM call: this route
  // writes rows and can reach a metered third-party API, and it has no auth in
  // front of it.
  const creatorHash = clientHash(request.headers.get("x-forwarded-for"));
  if (creatorHash) {
    if ((await countRecentUploads(creatorHash)) >= UPLOAD_RATE_LIMIT) {
      return bad(
        `That is ${UPLOAD_RATE_LIMIT} uploads in an hour. Try again later.`,
        429,
      );
    }
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let route;
  try {
    route = parseRouteFile(buf, file.name);
    assertSingleTrack(route, false);
  } catch (err) {
    if (err instanceof RouteError) return bad(err.message, 400);
    return bad("That file could not be read as a route.", 400);
  }

  let points = dedupe(route.points);

  // Surveyed elevation always wins; a terrain model is the fallback, never a
  // replacement. Same decision scripts/import/elevate.ts makes.
  let elevationSource = "gpx";
  if (lacksElevation(points)) {
    try {
      points = await fillElevationDecimated(points);
      elevationSource = `dem:${OPENTOPODATA.id}`;
    } catch {
      return bad(
        "That file has no elevation data, and the terrain model could not be " +
          "reached to fill it in. Try again shortly, or export the course with elevation.",
        502,
      );
    }
  }

  let geometry;
  try {
    geometry = resampleCourse(points);
  } catch (err) {
    if (err instanceof CourseParseError) return bad(err.message, 400);
    throw err;
  }

  const name =
    sanitizeCourseName(form.get("name") as string | null) ||
    sanitizeCourseName(route.name) ||
    nameFromFilename(file.name) ||
    "My course";

  const rawTz = (form.get("timezone") as string | null) ?? "";
  const timezone = isValidTimezone(rawTz) ? rawTz : "UTC";

  try {
    const { token, expiresAt } = await insertUserCourse(
      {
        name,
        elevations: geometry.elevations,
        coords: geometry.coords,
        profile: geometry.profile,
        timezone,
        elevationSource,
        distanceM: geometry.distanceM,
      },
      creatorHash,
    );

    return NextResponse.json({
      courseId: token,
      name,
      elevationSource,
      distanceKm: Number((geometry.distanceM / 1000).toFixed(3)),
      expiresAt: expiresAt.toISOString(),
      warnings: geometry.warnings,
    });
  } catch {
    return bad("Could not save that course. Try again.", 502);
  }
}
