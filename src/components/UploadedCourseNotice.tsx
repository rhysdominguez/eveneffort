// What a runner needs to know about a chart built from their own file, rather
// than from the seeded catalog. Two facts, and both are load-bearing:
//
//   1. Whether the elevation is surveyed or modelled. A DEM reads the ground,
//      not the road — it is wrong on bridges, in tunnels and under canopy —
//      and a pacing plan built on it is a materially different number. The
//      import pipeline draws exactly this distinction before spending a
//      permanent slug (scripts/import/qa.ts); a runner deserves it too.
//   2. When the link stops working. Uploaded courses lapse, and the link is
//      the only copy — there is no account to find it again from.
//
// Neutral chrome, not an alert: none of this means anything is wrong. Per
// DESIGN.md, red is reserved for primary actions and the uphill data signal,
// so a bordered panel in secondary text is the honest weight for a disclosure.
interface Props {
  /** "gpx" for surveyed, "dem:<dataset>" for modelled. */
  elevationSource?: string;
  /** ISO date the link expires, or null once an order has made it permanent. */
  expiresAtISO: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function UploadedCourseNotice({ elevationSource, expiresAtISO }: Props) {
  const modelled = elevationSource?.startsWith("dem:") ?? false;

  return (
    <aside
      aria-label="About this uploaded course"
      className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 print:hidden"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Your uploaded course
      </p>

      {modelled && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Your file carried no elevation, so the profile was filled in from a
          terrain model ({elevationSource?.replace("dem:", "")}). That reads the
          ground rather than the road, so it can be wrong across bridges and
          through tunnels. The pacing is sound; the climbing is an estimate.
        </p>
      )}

      <p className="text-sm text-[var(--color-text-secondary)]">
        {expiresAtISO ? (
          <>
            This link works until {formatDate(expiresAtISO)} — keep it
            somewhere, because it is the only way back to this course. Ordering
            a printed paceband keeps it for good.
          </>
        ) : (
          <>
            This course is saved permanently. The link will keep working.
          </>
        )}
      </p>
    </aside>
  );
}
