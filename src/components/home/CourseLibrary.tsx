import { COURSE_LIST } from "@/data/courses";

// The course catalogue band. Reads straight from COURSE_LIST, so when the GPX
// pipeline lands more courses the grid grows on its own and none of this copy
// needs revisiting.
//
// Deliberately does NOT claim a course count it can't back — today that's the
// seven majors, and the heading says so plainly while signalling that more are
// coming. Overstating the catalogue here would be the one thing a runner could
// immediately catch us out on.
export function CourseLibrary() {
  return (
    <section className="w-full border-y border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Course library
        </p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl tracking-tight text-[var(--color-text-primary)]">
          Every major, mapped metre by metre
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-text-secondary)]">
          Each course below is built from its official elevation data, not an
          approximation — every climb and descent is where the race actually
          puts it. More courses are being added as we map them.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {COURSE_LIST.map((course) => (
            <li key={course.id}>
              <a
                href="#calculator"
                className="block h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6 transition-colors hover:border-[var(--color-text-tertiary)]"
              >
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  {course.city}
                </p>
                <p className="mt-2 font-display text-lg text-[var(--color-text-primary)]">
                  {course.displayName}
                </p>
              </a>
            </li>
          ))}
          {/* The catalogue is genuinely still growing, so the grid ends on an
              honest placeholder rather than padding the count with courses we
              haven't mapped. Dashed border marks it as not-yet-real — the
              PlaceholderPanel idiom. */}
          <li>
            <div className="flex h-full flex-col justify-center rounded-2xl border border-dashed border-[var(--color-border)] p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                In progress
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                More marathons are being mapped and added.
              </p>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
