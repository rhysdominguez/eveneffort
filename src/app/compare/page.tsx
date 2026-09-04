import type { Metadata } from "next";
import Link from "next/link";
import { getCourseCatalog } from "@/db/queries";
import { parseCompareParams } from "@/lib/compareParams";
import { RaceComparison } from "@/components/RaceComparison";

export const metadata: Metadata = {
  title: "Race time converter — what your marathon time is worth on another course",
  description:
    "Convert a marathon finish time between any two courses at equal effort. Your 3:20 at Boston is a different number at Berlin, and this works out which — across every course we hold an elevation profile for.",
  // Unlike /results this page IS indexable: its params are all optional, so
  // the bare URL is a complete page in its own right. The canonical is what
  // keeps every ?from=…&to=… permutation folding back into this one entry
  // rather than being crawled as a few hundred thousand near-duplicates.
  alternates: { canonical: "/compare" },
};

// ROADMAP #8. Server component, same shape as /courses: the catalog is fetched
// once here and the whole page is derived from it, so no geometry is fetched
// and none is shipped. `CourseSummary.effort` has carried the conversion since
// #3 — there is no new query and no new computation behind this route.
//
// `searchParams` makes it dynamic, which is right for a link someone shares:
// the state has to be rendered server-side rather than appearing after
// hydration.
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [catalog, params] = await Promise.all([
    getCourseCatalog(),
    searchParams,
  ]);
  // Total — unlike parseResultsParams this has no failure case. A junk param
  // degrades to an empty picker, because a compare page with nothing chosen is
  // a usable page and an error screen is not. See the module header.
  const initial = parseCompareParams(params);

  return (
    <main className="w-full flex-1">
      <section className="mx-auto w-full max-w-7xl space-y-8 px-6 py-16">
        <header className="max-w-2xl space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Race comparison
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            What is your time worth at a different race?
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            A 3:20 at Boston is not a 3:20 at Berlin. Enter a finish time at one
            course and see what the same effort buys you at another — measured
            from each course&rsquo;s own elevation profile rather than a
            hand-assigned difficulty tier.
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Both times are run at the identical grade-adjusted pace, so they
            cost the same energy by the Minetti model. What that does not
            include is weather, altitude, and the toll a long descent takes on
            your legs.{" "}
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
              The race comparison is loading its courses. Pick a course from the
              calculator in the meantime.
            </p>
          </div>
        ) : (
          <RaceComparison catalog={catalog} initial={initial} />
        )}
      </section>
    </main>
  );
}
