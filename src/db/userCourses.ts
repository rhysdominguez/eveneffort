// Read/write for the user_course table — the courses runners upload.
//
// Modelled on weatherCache.ts, which established the runtime write path, but
// with ONE DELIBERATE INVERSION OF ITS CONTRACT, and it matters:
//
//   weatherCache swallows every error, because failing to memoise a forecast
//   costs nothing. Most of this module does the same — a read that fails is a
//   404 the caller already handles, and degrading is right.
//
//   makeUserCoursePermanent does NOT. It is called from the checkout route
//   before a Stripe session is created, and what it guarantees is that the URL
//   about to be printed on a physical paceband will still resolve. That is the
//   exact promise Rule 8 exists to keep. If it cannot be kept, the honest
//   outcome is to fail the order, not to take the money and hope. So it throws,
//   and the route turns that into a 502.
//
// See docs/UPLOADED-COURSES.md for why this table exists at all under Rule 6.
import { and, count, eq, gte, isNull, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { getDb, isDatabaseConfigured } from "./client.ts";
import { userCourses } from "./schema.ts";

/**
 * Reserved prefix for uploaded course ids.
 *
 * The whole design rests on this: `u-` + 22 lowercase alphanumerics satisfies
 * COURSE_SLUG_RE (src/lib/resultsParams.ts), so an uploaded course needs no
 * change to the results URL, the params parser or the checkout ladder — only a
 * branch in getCourseBySlug. courses.test.ts asserts no SEEDED slug starts with
 * it, which is what keeps the two namespaces from ever colliding.
 */
export const USER_COURSE_PREFIX = "u-";

/** How long a free upload lives. Cleared to null by a paceband order. */
export const UPLOAD_TTL_DAYS = 90;

/** Uploads allowed per client per window. */
export const UPLOAD_RATE_LIMIT = 10;
export const UPLOAD_RATE_WINDOW_MS = 60 * 60 * 1000;

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_LENGTH = 22;

/**
 * An unguessable course id. The link IS the credential — there is no account to
 * check it against — so this needs real entropy, not a timestamp or a counter.
 * 22 chars over a 36-symbol alphabet is ~113 bits.
 *
 * Rejection sampling rather than `% 36`, which would bias the first four
 * letters. The bias would be small and completely pointless to accept.
 */
export function newCourseToken(): string {
  let out = "";
  while (out.length < TOKEN_LENGTH) {
    for (const byte of randomBytes(TOKEN_LENGTH)) {
      if (byte >= 252) continue; // 252 = 7 * 36; keep the uniform range
      out += TOKEN_ALPHABET[byte % 36];
      if (out.length === TOKEN_LENGTH) break;
    }
  }
  return USER_COURSE_PREFIX + out;
}

export function isUserCourseId(id: string): boolean {
  return id.startsWith(USER_COURSE_PREFIX);
}

export interface UserCourseGeometry {
  name: string;
  elevations: number[];
  coords: [number, number][];
  profile: [number, number][];
  timezone: string;
  elevationSource: string;
  distanceM: number;
}

export interface StoredUserCourse extends UserCourseGeometry {
  token: string;
  startLat: number;
  startLon: number;
  expiresAt: Date | null;
}

/**
 * One uploaded course, or null on a miss, an expiry or any failure.
 *
 * Expiry is enforced here rather than by a sweeper — the same choice
 * weather_window makes. A lapsed row simply stops being selectable.
 */
export async function readUserCourse(token: string): Promise<StoredUserCourse | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const rows = await getDb()
      .select()
      .from(userCourses)
      .where(
        and(
          eq(userCourses.token, token),
          or(
            isNull(userCourses.expiresAt),
            sql`${userCourses.expiresAt} > now()`,
          ),
        ),
      )
      .limit(1);

    const r = rows[0];
    if (!r) return null;
    return {
      token: r.token,
      name: r.name,
      elevations: r.elevations,
      coords: r.coords,
      profile: r.profile,
      startLat: Number(r.startLat),
      startLon: Number(r.startLon),
      timezone: r.timezone,
      elevationSource: r.elevationSource,
      distanceM: r.distanceM,
      expiresAt: r.expiresAt,
    };
  } catch {
    // Unreachable or un-migrated — a miss is the safe answer, and the caller
    // already renders "we couldn't build a chart from this link".
    return null;
  }
}

/**
 * Store an uploaded course and return its public id.
 *
 * Unlike the cache writes, this one propagates failure: the runner is waiting
 * on the id and there is nothing to fall back to.
 */
export async function insertUserCourse(
  geometry: UserCourseGeometry,
  creatorHash: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newCourseToken();
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_DAYS * 24 * 3600 * 1000);

  await getDb()
    .insert(userCourses)
    .values({
      token,
      name: geometry.name,
      elevations: geometry.elevations,
      coords: geometry.coords,
      profile: geometry.profile,
      // == coords[0], denormalised the same way `course` does it.
      startLat: String(geometry.coords[0][0]),
      startLon: String(geometry.coords[0][1]),
      timezone: geometry.timezone,
      elevationSource: geometry.elevationSource,
      distanceM: Math.round(geometry.distanceM),
      creatorHash,
      expiresAt,
    });

  return { token, expiresAt };
}

/**
 * How many courses this client has uploaded inside the rate-limit window.
 *
 * Fails CLOSED-ish by returning the limit on error: if the counter cannot be
 * read we cannot bound the route, and an unbounded route that writes rows and
 * calls a metered elevation API is the one failure mode worth refusing over.
 */
export async function countRecentUploads(creatorHash: string): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  try {
    const since = new Date(Date.now() - UPLOAD_RATE_WINDOW_MS);
    const rows = await getDb()
      .select({ n: count() })
      .from(userCourses)
      .where(
        and(eq(userCourses.creatorHash, creatorHash), gte(userCourses.createdAt, since)),
      );
    return rows[0]?.n ?? 0;
  } catch {
    return UPLOAD_RATE_LIMIT;
  }
}

/**
 * Clear the expiry, making an uploaded course permanent.
 *
 * THROWS ON FAILURE, ON PURPOSE — see the module header. Called from
 * /api/checkout before the Stripe session exists, so that the link printed on
 * the band cannot later 404.
 */
export async function makeUserCoursePermanent(token: string): Promise<void> {
  const updated = await getDb()
    .update(userCourses)
    .set({ expiresAt: null })
    .where(eq(userCourses.token, token))
    .returning({ token: userCourses.token });

  if (updated.length === 0) {
    throw new Error(`user course ${token} not found; refusing to charge for it`);
  }
}
