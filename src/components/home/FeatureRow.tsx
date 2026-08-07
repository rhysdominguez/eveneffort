import Link from "next/link";
import type { ReactNode } from "react";

// One alternating copy/media row in the home page's feature stack. The media
// column is always REAL product UI (an actual ElevationChart, a stat block, the
// paceband strip) — never a screenshot — so these rows can never drift out of
// date with the product.
//
// Bullet marks are deliberately NEUTRAL, not the green ticks of the Macmillan
// reference: DESIGN.md keeps green reserved for a faster-than-goal delta and
// red for primary actions, so decorative color here would break both rules.
interface Props {
  eyebrow: string;
  title: string;
  bullets: string[];
  media: ReactNode;
  /** Put the media column first on desktop — alternates down the stack. */
  reverse?: boolean;
  /**
   * Give the media column the larger share of the row. The elevation chart is
   * a wide, detail-dense figure that reads as undersized against a full column
   * of copy at 1:1; the paceband strip and stat block do not need it.
   */
  wideMedia?: boolean;
}

function CheckMark() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-1 h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]"
    >
      <path d="M4.5 10.5 8 14l7.5-8" />
    </svg>
  );
}

export function FeatureRow({
  eyebrow,
  title,
  bullets,
  media,
  reverse,
  wideMedia,
}: Props) {
  // minmax(0,…) on both tracks, not plain fr: a grid track's default `auto`
  // minimum is its content's min-content width, which would let the chart's
  // axis labels or the copy's longest word push the row wider than the page.
  const columns = wideMedia
    ? "lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]"
    : "lg:grid-cols-2";

  return (
    <div className={`grid items-center gap-12 ${columns} lg:gap-16`}>
      <div className={reverse ? "lg:order-last" : undefined}>
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
          {eyebrow}
        </p>
        <h3 className="mt-3 font-display text-2xl tracking-tight text-[var(--color-text-primary)]">
          {title}
        </h3>
        <ul className="mt-6 space-y-3">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3">
              <CheckMark />
              <span className="text-base leading-relaxed text-[var(--color-text-secondary)]">
                {bullet}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/methodology"
          className="mt-6 inline-block text-sm font-medium text-[var(--color-text-primary)] underline underline-offset-4 transition-colors hover:text-[var(--color-text-secondary)]"
        >
          How it works
        </Link>
      </div>
      {/* min-w-0 so a wide child (the chart's SVG, the splits table's
          overflow-x wrapper) can shrink inside the grid track instead of
          forcing the row — and the page — to scroll sideways. */}
      <div className="min-w-0">{media}</div>
    </div>
  );
}
