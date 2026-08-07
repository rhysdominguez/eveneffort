"use client";
import type { CourseSummary } from "@/types";
import { CourseMap } from "@/components/home/CourseMap";
import { useHomeSelection } from "@/components/home/HomeSelectionProvider";
import { pinLocationLabel } from "@/components/home/courseMapData";

/**
 * The course library band — the catalogue's visual entry point, and the slot
 * this file has been holding open since the card grid was pulled.
 *
 * It is a client component only because it bridges the map's clicks to the
 * hero's form; everything below it on the page stays server-rendered.
 *
 * One pin per race today, all marathons, all red. When halves and 10Ks are
 * seeded the pin colour becomes a function of race type and a legend joins the
 * band — but that needs a palette decision (DESIGN.md keeps red rare and
 * reserved), so leave the hook, not the colours.
 */
export function CourseLibrary({ catalog }: { catalog: CourseSummary[] }) {
  const selection = useHomeSelection();

  return (
    <section className="w-full border-y border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-20">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Course library
          </p>
          <h2 className="text-2xl font-display tracking-tight text-[var(--color-text-primary)] lg:text-3xl">
            Find your race on the map
          </h2>
          <p className="text-base text-[var(--color-text-secondary)]">
            Every course we hold an official elevation profile for. Pick one and
            we&rsquo;ll load it into the calculator with its next race date
            already filled in.
          </p>
        </div>

        {catalog.length === 0 ? (
          // The normal state with no database configured — the build and the
          // test suite both run without one, so this path is not an edge case.
          <div className="flex h-96 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-surface)] px-6 text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">
              The course map is loading its races. Pick a course from the
              calculator in the meantime.
            </p>
          </div>
        ) : (
          <>
            <CourseMap
              catalog={catalog}
              onSelectCourse={(courseId) => selection?.requestCourse(courseId)}
            />

            <p className="text-sm text-[var(--color-text-secondary)]">
              {catalog.length} marathon{catalog.length === 1 ? "" : "s"} on the
              map, with more landing as their profiles are verified.
            </p>

            {/* The pins are drawn on a WebGL canvas: unreachable by keyboard,
                invisible to a screen reader. This list is the map's text
                equivalent, so the catalogue is still readable without it, and
                it points at the course dropdown — the control that already
                does this job accessibly. Deliberately NOT buttons: focusable
                controls inside `sr-only` are invisible tab stops, which is a
                worse trap than no controls at all. Do not remove it. */}
            <div className="sr-only">
              <p>
                Races on the map, all also selectable from the course dropdown
                in the pacing calculator:
              </p>
              <ul>
                {catalog.map((course) => (
                  <li key={course.id}>
                    {course.displayName} — {pinLocationLabel(course)}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
