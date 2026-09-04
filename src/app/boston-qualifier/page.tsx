import type { Metadata } from "next";
import Link from "next/link";
import { getCourseCatalog } from "@/db/queries";
import { BostonQualifier } from "@/components/BostonQualifier";
import { BQ_YEAR } from "@/lib/bq/standards";

export const metadata: Metadata = {
  title: `Boston Marathon qualifying times ${BQ_YEAR} — BQ standards by age`,
  description: `Every ${BQ_YEAR} Boston Marathon qualifying standard by age and division, what the cut-off has really cost in recent years, and which marathon courses the B.A.A.'s new net-downhill rule adds time to.`,
  alternates: { canonical: "/boston-qualifier" },
};

// The BQ tool. Server component for the same reason /courses is one: the whole
// page is derived from the catalog the picker already loads, so nothing is
// fetched twice and no geometry ships — the net-downhill index comes off
// `CourseSummary.terrain`, which is three numbers per course.
export default async function BostonQualifierPage() {
  const catalog = await getCourseCatalog();

  return (
    <main className="w-full flex-1">
      <section className="mx-auto w-full max-w-7xl space-y-8 px-6 py-16">
        <header className="max-w-2xl space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Boston qualifier
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            What you actually need to run for Boston
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            Your {BQ_YEAR} qualifying standard by age and division, whether a
            goal time clears it, and — the part most calculators leave out —
            whether it would have been enough to actually get in.
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Standards are published by the B.A.A.; the cut-offs are what
            acceptance historically required on top of them. If the race you are
            qualifying at drops steeply, the new net-downhill rule adds time to
            your result — pick the course to see it.{" "}
            <Link
              href="/courses"
              className="underline transition-colors hover:text-[var(--color-text-secondary)]"
            >
              Compare course profiles
            </Link>
            .
          </p>
        </header>

        <BostonQualifier catalog={catalog} />
      </section>
    </main>
  );
}
