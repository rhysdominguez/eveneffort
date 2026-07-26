import Link from "next/link";
import { parseResultsParams } from "@/lib/resultsParams";
import { Dashboard } from "@/components/Dashboard";

// Server component. In Next 16 `searchParams` is a promise — must be
// awaited. Inputs are validated here; the heavy lifting (compute + render)
// happens in the client Dashboard.
export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const parsed = parseResultsParams(await searchParams);

  if (!parsed.ok) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 space-y-4">
        <p className="text-sm text-[var(--color-text-primary)]">
          {parsed.reason} We couldn’t build a pacing chart from this link.
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

  return <Dashboard input={parsed.input} />;
}
