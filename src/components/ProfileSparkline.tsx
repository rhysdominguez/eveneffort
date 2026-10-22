import {
  SPARKLINE_HEIGHT,
  SPARKLINE_VIEWBOX,
  SPARKLINE_WIDTH,
} from "@/lib/chart/sparkline";

// A course's elevation shape at thumbnail size (ROADMAP #15). It draws a path
// somebody else already built: `elevationSparklinePath` runs on the server, so
// this component holds no geometry and does no maths, and the ranking table can
// sort and filter rows without recomputing anything.
//
// NON-INTERACTIVE ON PURPOSE. No hover line, no tooltip, no `<title>` (which
// browsers show as one). The hover chart on /results stays the only one. It is
// also hidden from assistive tech: the row already states the climbing, the net
// change and the profile label in words, and a screen reader has nothing to
// gain from a shape it cannot see.
//
// Its colour follows the row, like the chevron, so it goes red with the race
// name on hover. The stroke is `currentColor`; the tint lives on the class.
export function ProfileSparkline({ path }: { path: string | undefined }) {
  if (!path) return null;
  return (
    <svg
      data-profile-sparkline
      aria-hidden
      focusable="false"
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      viewBox={SPARKLINE_VIEWBOX}
      className="shrink-0 text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-red-primary)]"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
