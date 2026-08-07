import type { PacingResult } from "@/hooks/usePacingChart";
import { PaceBandStrip } from "./PaceBandStrip";

// The printable paceband: a narrow wrist-sized strip, one row per split,
// that becomes the ONLY visible content under @media print (everything else
// carries print:hidden). Never shown on screen — the on-screen splits table
// is PaceChartTable; this is its paper twin.
//
// The strip markup lives in PaceBandStrip, shared with the home page's
// on-screen preview. This component owns only the print framing: visibility,
// color-adjust, and the fold guide.
//
// Sizing lives in globals.css under @media print (pt/in units so the strip
// comes out at true wrist scale); colors stay on design tokens, with
// print-color-adjust: exact so the header bar and gel marks survive the
// printer's default background-stripping.
interface Props {
  result: PacingResult;
  courseName: string;
}

export function PaceBand({ result, courseName }: Props) {
  const unitLabel = result.input.unit === "km" ? "km" : "mi";
  // Same guard as PaceChartTable: fueling off ⇒ no dead gel column.
  const hasFueling = result.rows.some((row) => row.fueling);

  return (
    <section aria-label="Printable paceband" className="paceband hidden print:block">
      <PaceBandStrip
        rows={result.rows}
        courseName={courseName}
        unitLabel={unitLabel}
        hasFueling={hasFueling}
      />

      {/* Cut/fold guide, like a physical band template. */}
      <div className="paceband-fold border border-dashed border-[var(--color-text-tertiary)] text-[var(--color-text-secondary)]">
        Fold here
      </div>
    </section>
  );
}
