import type { TerrainLabel, CourseTerrain } from "@/types";
import { terrainLabel, TERRAIN_LABELS } from "@/lib/pacing/terrain";
import { metresToFeet } from "@/lib/units/elevation";
import { formatSignedFeet } from "@/lib/chart/geometry";

// How hilly a course is, and whether it finishes below where it started — two
// pills, because they are two independent facts and one chip would have to pick
// one and misrepresent the other.
//
// PILL ONE — COURSE PROFILE, and the only pill that carries colour. Six labels
// matching findmymarathon.com's vocabulary, so a runner comparing races reads
// the same words in both places; `terrain.ts` holds the criteria and how they
// were calibrated against that site's own data.
//
// IT HAS A COLOUR RAMP, WHICH DESIGN.md ONCE FORBADE. Until 2026-09-08 only the
// two hardest bands took red and everything else stayed grey, to keep red rare.
// Adopting a taxonomy runners already know brought its colour convention with
// it. That ramp shipped as three tiers over six labels and was widened to SIX
// stops the same day, because three tiers gave Mostly Flat and Rolling Hills
// the same pill — and those are the two biggest bands in the catalog, 118 and
// 120 of 326 courses. 73% of races rendered in a colour that told the runner
// nothing, which is the one job the pill has. Read the "What NOT to do" section
// of DESIGN.md, which argues the current position and records both it replaced.
//
// PILL TWO — NET CHANGE, finish minus start, exact at any resolution and the
// number the ends of the elevation profile show. ALWAYS NEUTRAL GREY, still: a
// third colour here would compete with the profile pill, and on a Downhill
// course it would only restate what the label already says. (This replaced an
// earlier "847 ft up" total-gain figure that read as a contradiction on loop
// courses, and a green-when-downhill treatment.)
const pillBase =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium";

// One stop per profile, ordered fastest → hardest, sweeping green to maroon.
// Four of the six are tokens the palette already had; `globals.css` carries the
// contrast figures and the hue sweep. Keep this in label order — reading it top
// to bottom is how you check the ramp still ramps.
const PROFILE_COLOR: Record<TerrainLabel, string> = {
  downhill: "text-[var(--color-green-primary)]",
  veryFlat: "text-[var(--color-lime-primary)]",
  mostlyFlat: "text-[var(--color-gold-primary)]",
  rolling: "text-[var(--color-orange-primary)]",
  hilly: "text-[var(--color-red-primary)]",
  veryHilly: "text-[var(--color-red-deep)]",
};

// Four glyphs cover six labels — the same economy findmymarathon's own artwork
// uses, where the two flat profiles share a treatment. `currentColor` means each
// inherits its pill's ramp stop, so there is no second colour switch here.
const ICON_PATHS: Record<TerrainLabel, string> = {
  // Level ground, with one faint rise on "mostly".
  veryFlat: "M2 13h16",
  mostlyFlat: "M2 13h4l3-2 3 2h6",
  // A single descending grade.
  downhill: "M3 5l6 6 8 4",
  // Repeated shallow humps → one dominant peak → sharp peaks.
  rolling: "M2 14l3.5-4 3.5 4 3.5-4 3.5 4",
  hilly: "M2 16l5-7 4 5 3-2 4 4",
  veryHilly: "M1 17l4-10 3 7 3-9 4 12",
};

interface Props {
  terrain: CourseTerrain;
  /** Drops the net-change pill, for the dense rows of the ranking table. */
  compact?: boolean;
}

export function DifficultyBadge({ terrain, compact = false }: Props) {
  const label = terrainLabel(terrain);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={`${pillBase} ${PROFILE_COLOR[label]}`}>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-3 w-3 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={ICON_PATHS[label]} />
        </svg>
        {TERRAIN_LABELS[label]}
      </span>
      {!compact && (
        <span
          className={`${pillBase} font-tabular text-[var(--color-text-secondary)]`}
        >
          {formatSignedFeet(metresToFeet(terrain.netM))} net
        </span>
      )}
    </span>
  );
}
