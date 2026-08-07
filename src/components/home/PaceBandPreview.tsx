import { PaceBandStrip } from "@/components/PaceBandStrip";
import { demoResult } from "./demoResult";

// A screen-visible preview of the printed paceband for the home page's
// "Race day" feature row.
//
// This renders the SAME PaceBandStrip markup that comes off the printer — not
// a lookalike. PaceBand itself can't be dropped in here because it is
// `hidden print:block` and all its geometry lives in the @media print block,
// so on screen it renders as nothing. The `.paceband-preview` scope in
// globals.css supplies that geometry for screen instead, every value being
// the print value times one shared multiplier. A change to the printed band
// therefore shows up here automatically.
//
// print:hidden so the marketing preview can never appear on paper alongside
// the real band.
const PREVIEW_ROWS = 12;

export function PaceBandPreview() {
  const rows = demoResult.rows.slice(0, PREVIEW_ROWS);
  const hasFueling = demoResult.rows.some((row) => row.fueling);

  return (
    <div className="paceband-preview flex justify-center print:hidden">
      <PaceBandStrip
        rows={rows}
        courseName="Boston Marathon"
        unitLabel="mi"
        hasFueling={hasFueling}
        footNote="… through 26.2"
      />
    </div>
  );
}
