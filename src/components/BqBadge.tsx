import type { BqStatus } from "@/lib/bq/qualify";
import { formatGap } from "@/lib/units/time";

// Whether this goal time clears the runner's Boston standard, and — separately
// — whether the course adds time to it first.
//
// TWO PILLS, NOT ONE, for the same reason DifficultyBadge has two: they are
// separate facts and one chip would have to pick a side. "You are 2:14 under
// your standard" is a verdict on the runner; "+5:00 because this course drops
// 2,000 ft" is a fact about the course, true whoever is running it.
//
// COLOR. No palette extension, and this is the argument. SummaryHeader's
// existing "vs goal" note already paints slower-than-target red and
// faster-than-target green; "2:14 under your standard" is the same meaning in
// the same component, so the two reserved semantics carry over unchanged. The
// index pill stays NEUTRAL on purpose — an index is not a verdict on the
// runner, and colouring it would imply the course did something wrong.
const pillBase =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium";

interface Props {
  status: BqStatus;
  /** Hides the index pill and the caveat, for a dense row. */
  compact?: boolean;
}

/** The verdict as a sentence, exported so the page and the tests share wording. */
export function bqVerdict(status: BqStatus): string {
  if (!status.eligible) return "Not eligible for Boston qualifying";
  return status.clears
    ? `Boston qualifier · ${formatGap(status.marginSeconds)} under`
    : `Misses Boston by ${formatGap(status.marginSeconds)}`;
}

export function BqBadge({ status, compact = false }: Props) {
  const indexed = status.indexSeconds > 0;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span
        className={`${pillBase} ${
          status.clears
            ? "text-[var(--color-green-primary)]"
            : "text-[var(--color-red-primary)]"
        }`}
      >
        {bqVerdict(status)}
      </span>
      {!compact && indexed && (
        <span
          className={`${pillBase} font-tabular text-[var(--color-text-secondary)]`}
        >
          +{formatGap(status.indexSeconds)} downhill index
        </span>
      )}
      {!compact && status.nearThreshold && (
        <span className="text-xs text-[var(--color-text-tertiary)]">
          Near the B.A.A.&rsquo;s threshold — confirm the index with them
        </span>
      )}
    </span>
  );
}
