import type { Metadata } from "next";
import Link from "next/link";
import { getCourseCatalog } from "@/db/queries";
import { CourseRankingTable } from "@/components/CourseRankingTable";

export const metadata: Metadata = {
  title: "Marathon course rankings — fastest, flattest, hilliest",
  description:
    "Every marathon course we hold an elevation profile for, ranked by how fast it runs: total climbing, net elevation change, and what each course costs against a flat marathon.",
  alternates: { canonical: "/courses" },
};

// The catalogue as a ranking rather than a map — the CourseLibrary band's
// text-shaped sibling, and the page a search for "fastest marathon course"
// should land on.
//
// Server component: the whole table is derived from the catalog the picker
// already loads, so nothing here is fetched twice and no geometry ships. The
// only client island is the table itself, which owns the sort state.
export default async function CoursesPage() {
  const catalog = await getCourseCatalog();

  return (
    <main className="w-full flex-1">
      <section className="mx-auto w-full max-w-7xl space-y-8 px-6 py-16">
        <header className="max-w-2xl space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Course rankings
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            Which marathon courses actually run fast
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            Every course we hold an official elevation profile for, measured the
            same way: how much it climbs, where it finishes relative to the
            start, and what the terrain costs against a flat marathon. Sort by
            any column; pick a race to load it into the calculator.
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Climbing is measured per kilometre from each course&rsquo;s
            elevation profile, so it is a consistent floor rather than a
            surveyed figure — comparable across races because every race is
            measured identically. Net change is exact.{" "}
            <Link
              href="/methodology"
              className="underline transition-colors hover:text-[var(--color-text-secondary)]"
            >
              How the cost is calculated
            </Link>
            .
          </p>
        </header>

        {catalog.length === 0 ? (
          // The normal state with no database configured — the build and the
          // test suite both run without one (Rule 9), so this is not an edge.
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] px-6 text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">
              The course rankings are loading their races. Pick a course from
              the calculator in the meantime.
            </p>
          </div>
        ) : (
          <CourseRankingTable catalog={catalog} />
        )}
      </section>
    </main>
  );
}
