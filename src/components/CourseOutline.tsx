import { renderOutline, type Outline } from "@/lib/course/outline";

// The course's shape, in the results header beside the race name. ROADMAP #21.
//
// WHY NO CHROME. This started life as a titled, bordered card next to the
// elevation profile, and at that size it read as a second chart competing with
// the first. It is not a chart: it is the course's signature, the thing a
// runner recognises before reading a word. So it lost the frame, the caption
// and the legend and moved into the empty band between the race name and the
// action buttons, where it reads as a mark rather than as data. The two dots
// carry their meaning by colour alone — green starts, red finishes, the same
// convention as every route map — and the svg's aria-label says it in a
// sentence for anyone who cannot see them.
//
// NO LIBRARY AND NO TILES, which is the whole point of the static version. The
// projection and path are pure functions in src/lib/course/outline.ts, so this
// renders identically on the server, in a test and in print. The interactive
// map (ROADMAP #22) is the one that pays for maplibre, and it will hang off
// this component rather than replace it.

interface Props {
  /** Simplified [lat, lon] polyline. The caller checks for null. */
  outline: Outline;
  /** Named in the accessible description, since the graphic has no text. */
  courseName: string;
  /** Sizing box, supplied by the caller: this component has no opinion. */
  className?: string;
}

// User units, not pixels: the SVG scales to its container. Only the longer
// side is fixed; the other follows the course's own proportions, so the
// drawing fills whatever box the caller gives it instead of being fitted twice.
const BOX = { size: 200, padding: 14 };

// Big enough to read at thumbnail scale, small enough not to swamp a course
// whose start and finish sit two streets apart.
const DOT_R = 6;

export function CourseOutline({ outline, courseName, className }: Props) {
  const rendered = renderOutline(outline, BOX);
  if (!rendered) return null;

  const { width, height, d, start, finish, isLoop } = rendered;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      // meet, not slice: a course cropped to fill the box is a different
      // course. Leftover space letterboxes into the surrounding whitespace,
      // which is invisible now that nothing is drawn around the shape.
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={
        isLoop
          ? `Route map of the ${courseName}, a loop starting and finishing in the same place.`
          : `Route map of the ${courseName}, from start to finish.`
      }
    >
      <path
        d={d}
        fill="none"
        stroke="var(--color-text-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {isLoop ? (
        // One mark, not two. On a loop the finish sits on top of the start
        // and whichever painted last would silently erase the other, so
        // the single dot carries both colours: green fill, red ring.
        <g>
          <circle
            cx={start.x}
            cy={start.y}
            r={DOT_R + 2}
            fill="none"
            stroke="var(--color-red-primary)"
            strokeWidth="2"
          />
          <circle
            cx={start.x}
            cy={start.y}
            r={DOT_R}
            fill="var(--color-green-primary)"
          />
        </g>
      ) : (
        <>
          <circle
            cx={start.x}
            cy={start.y}
            r={DOT_R}
            fill="var(--color-green-primary)"
          />
          <circle
            cx={finish.x}
            cy={finish.y}
            r={DOT_R}
            fill="var(--color-red-primary)"
          />
        </>
      )}
    </svg>
  );
}
