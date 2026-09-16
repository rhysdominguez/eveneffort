import type { Metadata } from "next";
import { getCourseCatalog } from "@/db/queries";
import { CourseRankingTable } from "@/components/CourseRankingTable";

export const metadata: Metadata = {
  title: "Marathon course rankings: fastest, flattest, hilliest",
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
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Course rankings
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            Select your course
          </h1>
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
