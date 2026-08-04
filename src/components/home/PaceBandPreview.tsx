import { demoResult } from "./demoResult";

// A screen-visible teaser of the printed paceband.
//
// PaceBand.tsx cannot be reused here: it is `hidden print:block` and every
// dimension it has lives in the @media print block in globals.css (pt/in, so
// the strip comes out at true wrist scale). On screen it renders as nothing.
// This is a small rem-sized facsimile of the same strip — same wordmark bars,
// same columns, same droplet gel mark — showing only the first stretch of the
// race. It is a teaser, not the band; the real one comes off the printer.
const PREVIEW_ROWS = 9;

/** Same path as PaceBand's GelIcon — the droplet is the fueling mark. */
function GelIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-3 w-3"
      style={{ fill: "var(--color-red-primary)" }}
    >
      <path d="M10 1.8C7.3 5.4 4.6 8.9 4.6 12.1a5.4 5.4 0 1 0 10.8 0c0-3.2-2.7-6.7-5.4-10.3Z" />
    </svg>
  );
}

const barStyle = {
  background: "var(--color-text-primary)",
  color: "var(--color-bg-surface)",
};

// 4 columns: mile, pace, split, gel — matching the printed band's order.
const rowClass = "grid grid-cols-[2rem_1fr_1fr_1.25rem] items-center gap-2 px-3";

export function PaceBandPreview() {
  const rows = demoResult.rows.slice(0, PREVIEW_ROWS);

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-[15rem] overflow-hidden rounded-lg border border-[var(--color-border)]">
        <div
          className="py-1.5 text-center font-wordmark text-sm leading-none"
          style={barStyle}
        >
          eveneffort
        </div>

        <div className="border-b border-[var(--color-border)] px-3 py-2 text-center text-xs font-medium text-[var(--color-text-primary)]">
          Boston Marathon
        </div>

        <div
          className={`${rowClass} py-1.5 text-[0.625rem] uppercase tracking-wider text-[var(--color-text-tertiary)]`}
        >
          <span>mi</span>
          <span className="text-right">pace</span>
          <span className="text-right">split</span>
          <span aria-hidden="true" />
        </div>

        {rows.map((row) => (
          <div
            key={row.segmentLabel}
            className={`${rowClass} border-t border-[var(--color-border)] py-1.5 font-tabular text-xs text-[var(--color-text-primary)]`}
          >
            <span>{row.segmentLabel}</span>
            {/* The column is headed by the unit, so the " /mi" suffix would
                just be repeated known information — strip it, as the real
                band does. */}
            <span className="text-right">
              {row.adjustedPaceLabel.replace(/ \/(km|mi)$/, "")}
            </span>
            <span className="text-right">{row.cumulativeSplitLabel}</span>
            <span className="flex justify-center">
              {row.fueling ? (
                <>
                  <GelIcon />
                  <span className="sr-only">Take gel</span>
                </>
              ) : null}
            </span>
          </div>
        ))}

        {/* The strip is truncated, and saying so is better than letting it
            look like the band stops at mile 9. */}
        <div className="border-t border-[var(--color-border)] py-2 text-center text-[0.625rem] uppercase tracking-wider text-[var(--color-text-tertiary)]">
          … through 26.2
        </div>

        <div
          className="py-1.5 text-center font-wordmark text-sm leading-none"
          style={barStyle}
        >
          eveneffort
        </div>
      </div>
    </div>
  );
}
