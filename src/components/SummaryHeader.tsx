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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className={eyebrowClass}>{label}</span>
      <span className="mt-1 block text-2xl font-tabular font-medium text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

export function SummaryHeader({ result, courseName }: Props) {
  const { goalTimeSeconds, unit } = result.input;
  const distance = unit === "km" ? MARATHON_KM : MARATHON_MILES;
  const avgPace = goalTimeSeconds / distance;
  const distanceLabel = `${distance.toFixed(2)} ${unit === "km" ? "km" : "mi"}`;

  return (
    <header className="space-y-6">
      <h2 className="text-3xl font-display tracking-tight text-[var(--color-text-primary)]">
        {courseName}
      </h2>
      <div className="grid grid-cols-3 gap-6 border-t border-b border-[var(--color-border)] py-6">
        <Stat label="Goal time" value={formatHMS(goalTimeSeconds)} />
        <Stat label="Average pace" value={formatPace(avgPace, unit)} />
        <Stat label="Distance" value={distanceLabel} />
      </div>
    </header>
  );
}
