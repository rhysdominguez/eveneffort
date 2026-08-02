"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { InputForm } from "@/components/InputForm";
import { buildResultsHref } from "@/lib/resultsParams";

// Marketing shell — scaffolding only. Sections are full-bleed bands (edge
// to edge, like the Macmillan reference); inner content stays in a
// centered max-width column for readability. Real headline copy comes
// later. Calculate navigates to the standalone /results route.
export default function Page() {
  const router = useRouter();

  return (
    <main className="w-full flex-1">
      {/* Hero band — full-bleed photo behind the whole section, edge to edge
          (the Macmillan reference), with the form floating on top. The
          source photo has the runner right-of-frame, which sat directly
          behind the form — mirrored horizontally so he lands on the left,
          in the empty column, and stays clear of the card. Headline copy
          TBD — the left column is reserved for it. */}
      {/* No overflow-hidden: it clipped the date/time popovers at the band's
          edge. The fill image is inset-0 with object-cover, so it crops
          itself and never needed clipping in the first place. */}
      <section className="relative w-full min-h-[30rem] lg:min-h-[44rem]">
        <Image
          src="/hero-runner1.jpg"
          alt="A runner mid-stride, motion-blurred, passing a sunlit fountain"
          fill
          priority
          sizes="100vw"
          className="scale-x-[-1] object-cover"
          style={{ objectPosition: "50% 39%" }}
        />
        {/* Veils the form's half of the photo so the type holds without
            putting a card back on top of the image. */}
        <div className="hero-scrim absolute inset-0" />
        <div className="relative mx-auto max-w-7xl px-6 py-16">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div />
            <InputForm
              title="Pacing Calculator"
              subtitle="Elevation-adjusted splits for your goal time, course, and conditions."
              onCalculate={(input) => router.push(buildResultsHref(input))}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
