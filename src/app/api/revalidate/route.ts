import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Drops the cached course catalog after a seed.
 *
 * src/db/queries.ts wraps its reads in unstable_cache with a one-hour TTL under
 * the "course-catalog" tag. Without a way to bust it, a bulk import is invisible
 * for up to an hour — indistinguishable from a seed that silently failed.
 *
 * The shared secret is a deploy webhook token, not user authentication: there
 * are no accounts and every row this touches is public read-only (CLAUDE.md
 * Rule 6). It exists so a stranger cannot force cache churn, nothing more.
 */
export async function POST(request: Request) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "revalidation is not configured" },
      { status: 503 },
    );
  }
  if (request.headers.get("x-revalidate-secret") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // "max" is Next 16's recommended profile: it marks the tag stale and serves
  // stale-while-revalidate, so the first request after a seed may still render
  // the old catalog before the fresh one lands. That is fine here — the
  // alternative that expires immediately is either the deprecated one-argument
  // form or updateTag, which only works inside a Server Action.
  revalidateTag("course-catalog", "max");
  return NextResponse.json({ revalidated: "course-catalog" });
}
