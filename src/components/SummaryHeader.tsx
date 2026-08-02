import type { PacingResult } from "@/hooks/usePacingChart";
import { formatHMS } from "@/lib/units/time";
import { formatPace } from "@/lib/units/pace";
import { MARATHON_KM, MILE_IN_KM } from "@/lib/pacing/segments";

interface Props {
  result: PacingResult;
  courseName: string;
}

const MARATHON_MILES = MARATHON_KM / MILE_IN_KM;

const eyebrowClass =
  "block text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium";

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
}) {
  return (
    <div>
      <span className={eyebrowClass}>{label}</span>
      <span className="mt-1 block text-2xl font-tabular font-medium text-[var(--color-text-primary)]">
        {value}
      </span>
      {note}
    </div>
  );
}

export function SummaryHeader({ result, courseName }: Props) {
  const { goalTimeSeconds, unit } = result.input;
  const { adjustedFinishSeconds, weatherApplied } = result;
  const distance = unit === "km" ? MARATHON_KM : MARATHON_MILES;
  const avgPace = goalTimeSeconds / distance;
  const distanceLabel = `${distance.toFixed(2)} ${unit === "km" ? "km" : "mi"}`;

  // The weather-adjusted finish is only meaningful when weather is applied;
  // without it the value is identical to the goal, so we keep the row 3-up.
  const delta = adjustedFinishSeconds - goalTimeSeconds;
  const showAdjusted = weatherApplied;
  const showDelta = showAdjusted && Math.abs(delta) > 0.5;

  return (
    <header className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-3xl font-display tracking-tight text-[var(--color-text-primary)]">
          {courseName}
        </h2>
        {/* Prints the wrist paceband (PaceBand.tsx) — everything else is
            print:hidden, so the browser dialog shows just the strip. Neutral
            chrome: red stays reserved for primary actions like Calculate. */}
        <button
          type="button"
          onClick={() => window.print()}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M5.5 7V3.5h9V7M5.5 14.5H4a1.5 1.5 0 0 1-1.5-1.5V8.5A1.5 1.5 0 0 1 4 7h12a1.5 1.5 0 0 1 1.5 1.5V13a1.5 1.5 0 0 1-1.5 1.5h-1.5" />
            <rect x="5.5" y="11.5" width="9" height="5" rx="0.5" />
          </svg>
          Print band
        </button>
      </div>
      <div
        className={`grid gap-6 border-t border-b border-[var(--color-border)] py-6 ${
          showAdjusted ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
        }`}
      >
        <Stat label="Goal time" value={formatHMS(goalTimeSeconds)} />
        {showAdjusted && (
          <Stat
            label="Adj. finish"
            value={formatHMS(adjustedFinishSeconds)}
            note={
              showDelta ? (
                <span
                  className={`mt-1 block text-sm font-tabular ${
                    delta > 0
                      ? "text-[var(--color-red-primary)]"
                      : "text-[var(--color-green-primary)]"
                  }`}
                >
                  {delta > 0 ? "+" : "−"}
                  {formatHMS(Math.abs(delta))} vs goal
                </span>
              ) : (
                <span className="mt-1 block text-sm text-[var(--color-text-tertiary)]">
                  Ideal conditions
                </span>
              )
            }
          />
        )}
        <Stat label="Average pace" value={formatPace(avgPace, unit)} />
        <Stat label="Distance" value={distanceLabel} />
      </div>
    </header>
  );
}
