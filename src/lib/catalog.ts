import type { CourseId, CourseSummary } from "@/types";

// The course a fresh visitor lands on when nothing is stored yet — the nav's
// "Pacing Calculator" link and InputForm's own initial state both need one.
//
// The catalog is sorted alphabetically by series name (src/db/queries.ts), so
// picking catalog[0] means "whichever course's name starts earliest in the
// alphabet" — a small, unfamiliar race today, and liable to change the moment
// a bulk import adds something that sorts earlier. Boston is the same course
// the marketing demo (src/components/home/demoResult.ts) already uses, so
// this keeps the "nothing stored yet" experience matching a race people
// actually recognize. It only falls back to catalog[0] if Boston isn't in the
// catalog at all, which only happens against a test fixture that omits it.
const PREFERRED_DEFAULT_COURSE_ID: CourseId = "boston";

export function defaultCourseId(catalog: CourseSummary[]): string | null {
  const preferred = catalog.find((c) => c.id === PREFERRED_DEFAULT_COURSE_ID);
  return preferred?.id ?? catalog[0]?.id ?? null;
}
