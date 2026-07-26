"use client";
import { useRouter } from "next/navigation";
import { InputForm } from "@/components/InputForm";
import { buildResultsHref } from "@/lib/resultsParams";

// Compatible devices/platforms shown in the logo strip. Each *.norm.png
// is pre-processed (whitespace trimmed, rendered to an identical 64px
// content height) so a single uniform CSS height makes them all appear
// the same size and vertically aligned. Regenerate with
// `node scripts/normalize_logos.mjs` if a source logo changes.
const LOGOS: { name: string; src: string }[] = [
  { name: "Strava", src: "/logos/strava.norm.png" },
  { name: "Garmin", src: "/logos/garmin.norm.png" },
  { name: "Coros", src: "/logos/coros.norm.png" },
  { name: "Apple Watch", src: "/logos/apple-watch.norm.png" },
  { name: "Suunto", src: "/logos/suunto.norm.png" },
];

// Marketing shell — scaffolding only. Sections are full-bleed bands (edge
// to edge, like the Macmillan reference); inner content stays in a
// centered max-width column for readability. Real copy/imagery comes
// later. Calculate navigates to the standalone /results route.
export default function Page() {
  const router = useRouter();

  return (
    <main className="w-full flex-1">
      {/* Hero band — full-bleed; image/headline TBD. Holds the real form. */}
      <section className="w-full border-b border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium">
            Hero section — full-bleed image / headline TBD
          </p>
          <div className="mt-8 grid items-center gap-12 lg:grid-cols-2">
            <div className="flex min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] p-8">
              <p className="text-sm text-[var(--color-text-tertiary)]">
                Hero headline &amp; supporting copy go here
              </p>
            </div>
            <InputForm
              title="Pacing Calculator"
              onCalculate={(input) => router.push(buildResultsHref(input))}
            />
          </div>
        </div>
      </section>

      {/* Logo-cloud band — full-bleed; partner / sponsor logos TBD */}
      <section className="w-full border-b border-dashed border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <p className="font-display font-bold text-xl tracking-tight text-[var(--color-text-primary)]">
            Compatible With
          </p>
          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
            {LOGOS.map(({ name, src }) => (
              <div
                key={name}
                className="flex h-20 items-center justify-center px-6"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={name}
                  className="h-8 w-auto max-w-full object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
