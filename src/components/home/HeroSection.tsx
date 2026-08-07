"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import heroRunner from "../../../public/hero-runner1.jpg";
import type { CourseSummary } from "@/types";
import { InputForm } from "@/components/InputForm";
import { useHomeSelection } from "@/components/home/HomeSelectionProvider";
import { buildResultsHref } from "@/lib/resultsParams";

// Hero band — full-bleed photo behind the whole section, edge to edge
// (the Macmillan reference), with the form floating on top. The source
// photo has the runner right-of-frame, which sat directly behind the
// form — mirrored horizontally so he lands on the left, in the empty
// column, and stays clear of the card. Headline copy TBD — the left
// column is reserved for it. Calculate navigates to /results.
//
// This is the only client island on the home page: it owns the router.
// Everything below it on the page is server-rendered, so lifting it out
// of page.tsx is what lets the demo pace chart be computed at build time.
export function HeroSection({ catalog }: { catalog: CourseSummary[] }) {
  const router = useRouter();
  // Picking a race on the course map below scrolls back up to here with that
  // course already loaded into the form.
  const selection = useHomeSelection();

  return (
    // No overflow-hidden: it clipped the date/time popovers at the band's
    // edge. The fill image is inset-0 with object-cover, so it crops
    // itself and never needed clipping in the first place.
    //
    // scroll-mt-24 so the in-page "#calculator" links from the course
    // cards and the closing CTA don't land under the compressed nav.
    <section
      id="calculator"
      className="relative w-full min-h-[30rem] scroll-mt-24 lg:min-h-[44rem]"
    >
      {/* Imported rather than referenced by path on purpose. A static import
          gets a content-hashed URL, which the optimizer serves `immutable`
          instead of the `max-age=0, must-revalidate` a public/ path gets, and
          it makes Next generate `blurDataURL` at build time.
          `placeholder="blur"` then inlines that thumbnail in the HTML, so the
          band comes up as the photo's own colors on first paint and resolves
          into focus — it used to flash white until the full image landed. */}
      <Image
        src={heroRunner}
        alt="A runner mid-stride, motion-blurred, passing a sunlit fountain"
        fill
        priority
        placeholder="blur"
        quality={60}
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
            catalog={catalog}
            requestedCourseId={selection?.courseId ?? null}
            onCalculate={(input) => router.push(buildResultsHref(input))}
          />
        </div>
      </div>
    </section>
  );
}
