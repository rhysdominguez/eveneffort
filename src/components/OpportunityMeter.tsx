"use client";
import type { ImpactBreakdown } from "@/lib/pacing/impact";
import {
  courseOpportunity,
  OPPORTUNITY_BAND_CENTERS,
  OPPORTUNITY_LABELS,
  OPPORTUNITY_ORDER,
} from "@/lib/pacing/opportunity";

// The Impact breakdown's closing line (ROADMAP #25): the total, as a position on
// a red-to-green scale and one word. The scoring argument lives in
// src/lib/pacing/opportunity.ts; this file is only how it looks.
//
// THE BAR SPENDS THE COLOUR, SO NOTHING ELSE DOES. The verdict word and the tick
// are both neutral text colour. Tinting the word to match the marker's stop was
// the first draft and it reads as two instruments shouting the same thing, which
// is exactly the loudness DESIGN.md warns against on a near-monochrome page. The
// tick carries a ring in the tile's own background so it stays findable over the
// green end and the deep red end alike, in both themes, without spending a
// second colour on itself.
//
// THE GRADIENT IS THE PROFILE RAMP, REVERSED, and it lives in globals.css as
// `.opportunity-track` for the same reason `.hero-scrim` does: gradient geometry
// in CSS, every colour still from a token. See the DESIGN.md note on why one
// ramp serving both this and DifficultyBadge is coherence rather than a second
// scale.

interface Props {
  impact: ImpactBreakdown;
}

/**
 * What the bar says, for a reader who cannot see it. The gradient is never the
 * only carrier of the verdict.
 */
function describe(band: string, percent: number): string {
  const magnitude = Math.abs(percent).toFixed(1);
  if (Number(magnitude) === 0) {
    return `Performance Impact: ${band}. Conditions are neutral.`;
  }
  const direction = percent > 0 ? "cost you" : "give you back";
  return `Performance Impact: ${band}. Conditions ${direction} ${magnitude} percent.`;
}

export function OpportunityMeter({ impact }: Props) {
  const { score, band, percent } = courseOpportunity(impact);
  const label = OPPORTUNITY_LABELS[band];

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          Performance Impact
        </span>
        <span
          data-testid="opportunity-verdict"
          className="font-tabular text-sm font-medium text-[var(--color-text-primary)]"
        >
          {label}
        </span>
      </div>

      <div className="relative py-1">
        <div
          role="img"
          aria-label={describe(label, percent)}
          className="opportunity-track h-2 w-full rounded-full"
        />
        {/* Position is the only thing set inline, and it is geometry rather
            than colour. Clamped a hair inside the ends so a score of 0 or 100
            still reads as a tick on the bar and not as a cut edge. */}
        <span
          aria-hidden="true"
          data-testid="opportunity-marker"
          className="absolute top-0 h-4 w-[2px] -translate-x-1/2 rounded-full bg-[var(--color-text-primary)] ring-2 ring-[var(--color-bg-elevated)]"
          style={{ left: `${Math.min(99, Math.max(1, score))}%` }}
        />
      </div>

      {/* Each label sits over the MIDDLE OF ITS OWN BAND, not at the edges of
          the bar. Spread edge to edge, "Moderate" sat at the 50% mark while
          the moderate band runs 38.6 to 65, so a marker at 60 stood under the
          word "Moderate" while the verdict beside it read "Favorable". The
          positions are derived from the thresholds, so they cannot drift. */}
      <div className="relative h-3 font-tabular text-[10px] text-[var(--color-text-tertiary)]">
        {OPPORTUNITY_ORDER.map((key) => (
          <span
            key={key}
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${OPPORTUNITY_BAND_CENTERS[key]}%` }}
          >
            {OPPORTUNITY_LABELS[key]}
          </span>
        ))}
      </div>
    </div>
  );
}
