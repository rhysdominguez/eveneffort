// Serializing the /compare page's state into its query string and parsing it
// back — the same job src/lib/resultsParams.ts does for /results, and written
// to match it: pure, synchronous, shape-only slug validation, short param
// names, and nothing emitted that is at its default.
//
// ONE DELIBERATE DIVERGENCE: this never returns a failure. `parseResultsParams`
// answers `{ ok: false, reason }` because /results genuinely cannot render
// without a course — there is no chart to draw. /compare can: two empty
// pickers waiting for a selection is its legitimate resting state, and it is
// exactly what someone typing the bare URL should get. So a junk param falls
// back to a default rather than replacing a usable page with an error screen.
//
// The unit is display-only here. It picks whether the shared grade-adjusted
// pace reads /km or /mi and nothing else — `equivalentGoalTime` is defined on
// the km segmentation and takes no unit — so it is omitted from the query
// unless it is off-default, and a link that loses it still resolves to the
// same converted time.
import type { CourseId, Unit } from "@/types";
import { COURSE_SLUG_RE } from "@/lib/resultsParams";

/**
 * The 4:00 marathon `InputForm` and `CourseRankingTable` both already open on.
 * A compare page with no time entered is useless, so unlike the course pickers
 * this field starts populated rather than empty.
 */
export const DEFAULT_COMPARE_SECONDS = 4 * 3600;

/** The bounds `InputForm` validates a goal time against, applied here too. */
export const MAX_COMPARE_SECONDS = 10 * 3600;

const DEFAULT_UNIT: Unit = "km";

/**
 * What the page holds. Both courses may be unset — `""` rather than null,
 * because that is what `CourseSearch` renders as an empty field.
 */
export interface CompareSelection {
  fromId: CourseId | "";
  toId: CourseId | "";
  goalTimeSeconds: number;
  unit: Unit;
}

export function buildCompareHref(selection: CompareSelection): string {
  const query = buildCompareQuery(selection);
  return query ? `/compare?${query}` : "/compare";
}

/**
 * The query string alone. Empty when nothing has been chosen, so the bare
 * `/compare` — the canonical URL in the sitemap — is what the address bar
 * shows until the runner has actually built a comparison worth sharing.
 */
export function buildCompareQuery(selection: CompareSelection): string {
  const params = new URLSearchParams();

  if (selection.fromId) params.set("from", selection.fromId);
  if (selection.toId) params.set("to", selection.toId);
  if (selection.fromId || selection.toId) {
    params.set("t", String(Math.round(selection.goalTimeSeconds)));
  }
  if (selection.unit !== DEFAULT_UNIT) params.set("unit", selection.unit);

  return params.toString();
}

/**
 * Read a query string into a usable page state. Total — every input maps to
 * something renderable; see the header for why there is no failure case.
 */
export function parseCompareParams(
  params: Record<string, string | string[] | undefined>,
): CompareSelection {
  return {
    fromId: slug(first(params.from)),
    toId: slug(first(params.to)),
    goalTimeSeconds: seconds(first(params.t)),
    unit: first(params.unit) === "miles" ? "miles" : DEFAULT_UNIT,
  };
}

/**
 * Shape only — existence is proven downstream by looking the id up in the
 * catalog, exactly as `parseResultsParams` defers to `getCourseBySlug`. A
 * well-formed slug for a course that isn't seeded parses fine here and simply
 * finds no match, which is the right outcome for a link shared before a course
 * was retired.
 */
function slug(value: string | undefined): CourseId | "" {
  return value && COURSE_SLUG_RE.test(value) ? value : "";
}

function seconds(value: string | undefined): number {
  const n = Number(value);
  if (value === undefined || value === "" || !Number.isFinite(n)) {
    return DEFAULT_COMPARE_SECONDS;
  }
  const rounded = Math.round(n);
  if (rounded <= 0 || rounded > MAX_COMPARE_SECONDS) {
    return DEFAULT_COMPARE_SECONDS;
  }
  return rounded;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
