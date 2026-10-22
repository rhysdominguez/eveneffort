// Full geometry for one course, so the dashboard can switch races without a
// page navigation.
//
// This exists because /results used to change course by rewriting the URL and
// letting the server component re-render with new props. That write-back is
// gone (the address bar no longer tracks the form), so the elevation profile
// has to reach the browser some other way. It is still fetched one course at a
// time: shipping every course's dense profile up front is exactly what
// results/page.tsx avoids.
//
// Error discipline mirrors /api/checkout and /api/weather: JSON plus a distinct
// status, so the caller can tell "bad id" from "no such course".
import { COURSE_SLUG_RE } from "@/lib/resultsParams";
import { getCourseBySlug } from "@/db/queries";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/courses/[slug]">,
): Promise<Response> {
  const { slug } = await ctx.params;

  // Shape only, the same gate parseResultsParams applies before it trusts a
  // slug off the query string. Resolving it is what proves it exists.
  if (!COURSE_SLUG_RE.test(slug)) {
    return Response.json({ error: "Malformed course id." }, { status: 400 });
  }

  // The single existence proof for a course id in the app, and the one place
  // that knows about the `u-` upload prefix (Rule 8), so uploaded courses
  // resolve here without this route knowing they exist.
  const course = await getCourseBySlug(slug);
  if (!course) {
    return Response.json({ error: "Unknown course." }, { status: 404 });
  }

  // no-store deliberately. getSeededCourseBySlug is already memoised for an
  // hour server-side, and the upload branch sits outside that cache precisely
  // so a fresh upload resolves immediately. Caching the response here would
  // undo that, and would also outlive an uploaded course's expiry.
  return Response.json(course, {
    headers: { "Cache-Control": "no-store" },
  });
}
