import type { Metadata } from "next";
import Link from "next/link";
import { getCourseCatalog } from "@/db/queries";
import { BostonQualifier } from "@/components/BostonQualifier";
import { BQ_YEAR } from "@/lib/bq/standards";

export const metadata: Metadata = {
  title: `Boston Marathon qualifying times ${BQ_YEAR}: BQ standards by age`,
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
        <header className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Boston qualifier
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            {BQ_YEAR} Boston Marathon qualifying standards
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            Enter your age, division, and goal time to see whether it clears
            your standard, and whether it would have been enough to actually
            get in. Standards come from the B.A.A.; the cut-offs are what
            acceptance has historically required on top of them, and the
            net-downhill rule adds time back on courses that drop steeply, so{" "}
            <Link
              href="/courses"
              className="underline transition-colors hover:text-[var(--color-text-secondary)]"
            >
              compare course profiles
            </Link>{" "}
            to check yours.
          </p>
        </header>

        <BostonQualifier catalog={catalog} />
      </section>
    </main>
  );
}
