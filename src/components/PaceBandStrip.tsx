import type { PaceChartRow } from "@/types";

// The band strip itself — wordmark bars, course line, column heads, one row
// per split. Shared markup, deliberately: it is rendered both by PaceBand
// (on paper, sized by the @media print block) and by the home page's
// PaceBandPreview (on screen, sized by the .paceband-preview block). Both
// sizings drive the SAME paceband-* class names off the same numbers, so the
// screen preview cannot drift into being a lookalike of a band we no longer
// print.
//
// Carries no visibility or scale of its own — that is the caller's job.
interface Props {
  rows: PaceChartRow[];
  courseName: string;
  /** "km" or "mi" — heads the split column. */
  unitLabel: string;
  hasFueling: boolean;
  /**
   * Optional trailing row, for callers showing only part of the race. Without
   * it a truncated strip reads as a band that simply stops early.
   */
  footNote?: string;
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

export function PaceBandStrip({
  rows,
  courseName,
  unitLabel,
  hasFueling,
  footNote,
}: Props) {
  return (
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

      {rows.map((row) => (
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

      {footNote && (
        <div className="paceband-note border-t border-[var(--color-border)] text-[var(--color-text-tertiary)]">
          {footNote}
        </div>
      )}

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
  );
}
