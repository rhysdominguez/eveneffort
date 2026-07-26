import type { PacingResult } from "@/hooks/usePacingChart";

interface Props {
  result: PacingResult;
}

const headerClass =
  "px-4 py-3 text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium";

export function PaceChartTable({ result }: Props) {
  const unitLabel = result.input.unit === "km" ? "Km" : "Mile";

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--color-bg-elevated)]">
            <th className={`${headerClass} text-left`}>{unitLabel}</th>
            <th className={`${headerClass} text-right`}>Target Pace</th>
            <th className={`${headerClass} text-right`}>Cumulative Split</th>
            <th className={`${headerClass} text-right`}>Fueling</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr
              key={row.segmentLabel}
              className="border-t border-[var(--color-border)]"
            >
              <td className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">
                {row.segmentLabel}
              </td>
              <td className="px-4 py-3 text-right font-tabular text-[var(--color-text-primary)]">
                {row.adjustedPaceLabel}
              </td>
              <td className="px-4 py-3 text-right font-tabular text-[var(--color-text-primary)]">
                {row.cumulativeSplitLabel}
              </td>
              <td className="px-4 py-3 text-right">
                {row.fueling ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--color-red-primary)]">
                    {row.fueling.label}
                  </span>
                ) : (
                  <span className="text-[var(--color-text-tertiary)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
