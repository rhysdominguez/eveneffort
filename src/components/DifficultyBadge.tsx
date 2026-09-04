import type { CourseTerrain } from "@/types";
import {
  isNetDownhill,
  terrainLabel,
  TERRAIN_LABELS,
} from "@/lib/pacing/terrain";
import { metresToFeet } from "@/lib/units/elevation";
import { formatFeet, formatSignedFeet } from "@/lib/chart/geometry";

// How hilly a course is, and whether it finishes below where it started.
//
// TWO PILLS, NOT ONE. Those are separate facts and a single chip would have to
// pick one and lie about the other: REVEL Mt Charleston climbs 8 m and drops
// 1,549, so it is genuinely "flat" AND the fastest course in the catalog, while
// Big Sur is hilly and net-downhill at once. The label answers "what will the
// ground do to me"; the drop answers "is this a fast course".
//
// COLOR. DESIGN.md keeps red and green rare and reserved, and this does not add
// to the palette — it extends the two meanings already in use: red is the
// uphill direction in the splits table, green is faster-than-goal. So the two
// hardest bands take red and a net drop takes green, and the two ordinary bands
// stay in neutral text. Nothing gets a tinted background; the pill outline is
// the same --color-border every other control uses.
const pillBase =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium";

interface Props {
  terrain: CourseTerrain;
  /** Hides the gain figure, for the dense rows of the ranking table. */
  compact?: boolean;
}

export function DifficultyBadge({ terrain, compact = false }: Props) {
  const label = terrainLabel(terrain);
  const climbs = label === "hilly" || label === "mountainous";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span
        className={`${pillBase} ${
          climbs
            ? "text-[var(--color-red-primary)]"
            : "text-[var(--color-text-secondary)]"
        }`}
      >
        {TERRAIN_LABELS[label]}
        {!compact && (
          <span className="font-tabular text-[var(--color-text-tertiary)]">
            {formatFeet(metresToFeet(terrain.gainM))} up
          </span>
        )}
      </span>
      {isNetDownhill(terrain) && (
        <span
          className={`${pillBase} text-[var(--color-green-primary)] font-tabular`}
        >
          {formatSignedFeet(metresToFeet(terrain.netM))} net
        </span>
      )}
    </span>
  );
}
