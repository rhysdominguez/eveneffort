import { DEMO_WEATHER } from "./demoResult";

// The media column for the weather feature row: what a warm, humid morning
// actually costs the demo 3:30 runner, in the app's own stat-block idiom
// (DESIGN.md → Stat blocks).
//
// Deliberately NOT SummaryHeader, even though it renders the same pair on
// /results: that component owns the Print → Stripe order flow and fires
// analytics, none of which belongs on a marketing page.
function formatCost(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `+${minutes} min`;
}

export function WeatherStatBlock() {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
        {DEMO_WEATHER.tempC}°C · {DEMO_WEATHER.humidity}% humidity
      </p>

      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-b border-[var(--color-border)] py-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Goal
          </p>
          <p className="mt-2 font-tabular text-2xl font-medium text-[var(--color-text-primary)]">
            {DEMO_WEATHER.goalLabel}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            In the heat
          </p>
          <p className="mt-2 font-tabular text-2xl font-medium text-[var(--color-text-primary)]">
            {DEMO_WEATHER.adjustedLabel}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Cost
          </p>
          <p className="mt-2 font-tabular text-2xl font-medium text-[var(--color-text-primary)]">
            {formatCost(DEMO_WEATHER.costSeconds)}
          </p>
        </div>
      </div>

      <p className="mt-6 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        Same runner, same fitness, same course. The difference is the morning
        they got — and knowing it in advance is what stops it ambushing you at
        mile 18.
      </p>
    </div>
  );
}
