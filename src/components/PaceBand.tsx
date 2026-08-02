import type { PacingResult } from "@/hooks/usePacingChart";

// The printable paceband: a narrow wrist-sized strip, one row per split,
// that becomes the ONLY visible content under @media print (everything else
// carries print:hidden). Never shown on screen — the on-screen splits table
// is PaceChartTable; this is its paper twin.
//
// Sizing lives in globals.css under @media print (pt/in units so the strip
// comes out at true wrist scale); colors stay on design tokens, with
// print-color-adjust: exact so the header bar and gel marks survive the
// printer's default background-stripping.
interface Props {
  result: PacingResult;
  courseName: string;
}

/** Droplet mark for rows carrying a fueling cue — mirrors the droplet
 * service icons on paceband.org's bands, in our red. */
function GelIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="paceband-gel"
      style={{ fill: "var(--color-red-primary)" }}
    >
      <path d="M10 1.8C7.3 5.4 4.6 8.9 4.6 12.1a5.4 5.4 0 1 0 10.8 0c0-3.2-2.7-6.7-5.4-10.3Z" />
    </svg>
  );
}

export function PaceBand({ result, courseName }: Props) {
  const unitLabel = result.input.unit === "km" ? "km" : "mi";
  // Same guard as PaceChartTable: fueling off ⇒ no dead gel column.
  const hasFueling = result.rows.some((row) => row.fueling);

  return (
    <section aria-label="Printable paceband" className="paceband hidden print:block">
      <div className="paceband-strip border border-[var(--color-border)]">
        {/* Wordmark bars top and bottom — near-black prints reliably and
            keeps red rare; the band is recognizable folded either way. */}
        <div
          className="paceband-bar font-wordmark"
          style={{
            background: "var(--color-text-primary)",
            color: "var(--color-bg-surface)",
          }}
        >
          eveneffort
        </div>

        <div className="paceband-course border-b border-[var(--color-border)] text-[var(--color-text-primary)]">
          {courseName}
        </div>

        <div className="paceband-row paceband-head text-[var(--color-text-tertiary)]">
          <span>{unitLabel}</span>
          <span>pace</span>
          <span>split</span>
          {/* Empty stub keeps the split column aligned with the rows below;
              an icon column explains itself. */}
          {hasFueling && <span aria-hidden="true" />}
        </div>

        {result.rows.map((row) => (
          <div
            key={row.segmentLabel}
            className="paceband-row border-t border-[var(--color-border)] font-tabular text-[var(--color-text-primary)]"
          >
            <span className="paceband-km">{row.segmentLabel}</span>
            {/* The band column is headed by the unit, so the " /km" suffix
                would be 43 repetitions of known information — strip it. */}
            <span>{row.adjustedPaceLabel.replace(/ \/(km|mi)$/, "")}</span>
            <span>{row.cumulativeSplitLabel}</span>
            {hasFueling && (
              <span className="paceband-gelcell">
                {row.fueling ? (
                  <>
                    <GelIcon />
                    <span className="sr-only">Take gel</span>
                  </>
                ) : null}
              </span>
            )}
          </div>
        ))}

        <div
          className="paceband-bar font-wordmark"
          style={{
            background: "var(--color-text-primary)",
            color: "var(--color-bg-surface)",
          }}
        >
          eveneffort
        </div>
      </div>

      {/* Cut/fold guide, like a physical band template. */}
      <div className="paceband-fold border border-dashed border-[var(--color-text-tertiary)] text-[var(--color-text-secondary)]">
        Fold here
      </div>
    </section>
  );
}
