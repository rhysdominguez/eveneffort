import Link from "next/link";
import type { Metadata } from "next";
import { parseResultsParams } from "@/lib/resultsParams";
import { getCourseBySlug, getCourseCatalog } from "@/db/queries";
import { Dashboard } from "@/components/Dashboard";

// A results page is a pure function of its query string, so every share of a
// pacing chart would otherwise mint another near-duplicate URL for Google to
// crawl. Noindex keeps the index to the three real pages (see sitemap.ts);
// `follow` still lets crawlers walk the links back out to them.
export const metadata: Metadata = {
  title: "Your pacing chart",
  robots: { index: false, follow: true },
};

// Server component. In Next 16 `searchParams` is a promise — must be
// awaited. Inputs are validated here; the heavy lifting (compute + render)
// happens in the client Dashboard.
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const parsed = parseResultsParams(await searchParams);

  if (!parsed.ok) return <ResultsError reason={parsed.reason} />;

  // `parseResultsParams` can only vouch for the slug's shape. Resolving it to
  // real geometry is what proves the course exists — and it happens here, on
  // the server, so the dense elevation profile never has to be shipped for
  // every course just to chart one.
  const [course, catalog] = await Promise.all([
    getCourseBySlug(parsed.input.courseId),
    getCourseCatalog(),
  ]);
  if (!course) return <ResultsError reason="Missing or unknown course." />;

  return <Dashboard input={parsed.input} course={course} catalog={catalog} />;
}

function ResultsError({ reason }: { reason: string }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 space-y-4">
      <p className="text-sm text-[var(--color-text-primary)]">
        {reason} We couldn’t build a pacing chart from this link.
      </p>
      <Link
        href="/"
        className="text-sm font-medium text-[var(--color-red-primary)] transition-colors hover:text-[var(--color-red-deep)]"
      >
        ← Back to start
      </Link>
    </main>
  );
}
