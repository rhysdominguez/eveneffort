import { ElevationChart } from "@/components/ElevationChart";
import { HeroSection } from "@/components/home/HeroSection";
import { CourseLibrary } from "@/components/home/CourseLibrary";
import { RaceCalendar } from "@/components/home/RaceCalendar";
import { FeatureRow } from "@/components/home/FeatureRow";
import { PaceBandPreview } from "@/components/home/PaceBandPreview";
import { WeatherStatBlock } from "@/components/home/WeatherStatBlock";
import { ClosingCta } from "@/components/home/ClosingCta";
import { HomeSelectionProvider } from "@/components/home/HomeSelectionProvider";
import { DEMO_COURSE, demoResult } from "@/components/home/demoResult";
import { getCourseCatalog, getEventCalendar } from "@/db/queries";
import { todayISO } from "@/lib/units/date";

// Marketing home page. Sections are full-bleed bands (edge to edge, like the
// Macmillan reference); inner content stays in a centered max-width column for
// readability.
//
// Still a SERVER component. The client islands are HeroSection (which owns the
// router) and CourseLibrary (which owns the map), joined by HomeSelectionProvider
// so a pin click lands in the hero's form. Wrapping the tree in that provider
// does NOT make its children client components — the feature rows below are
// passed through as `children` and stay server-rendered, so the demo pace chart
// is still computed at build time and the feature media can be the real product
// components rather than screenshots that go stale.
export default async function Page() {
  const [catalog, editions] = await Promise.all([
    getCourseCatalog(),
    getEventCalendar(),
  ]);

  return (
    <HomeSelectionProvider>
    <main className="w-full flex-1">
      <HeroSection catalog={catalog} />

      <CourseLibrary catalog={catalog} />

      {/* RaceCalendar corrects this to the visitor's own date on mount — it is
          only the seed for a matching first render, since this page prerenders. */}
      <RaceCalendar editions={editions} todayISO={todayISO()} />

      <section className="w-full border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl space-y-24 px-6 py-20 lg:space-y-32">
          <FeatureRow
            wideMedia
            eyebrow="Elevation"
            title="Splits shaped by the course, not a calculator's average"
            bullets={[
              "Built from the official elevation profile — every climb and descent where the race actually puts it.",
              "Paces ease on the way up and pick up on the way down, so the effort stays level even though the ground doesn't.",
              "Your goal finish time never changes. Only the way you spend it does.",
            ]}
            media={
              <ElevationChart
                profile={DEMO_COURSE.profile}
                unit="miles"
                rows={demoResult.rows}
              />
            }
          />

          <FeatureRow
            reverse
            eyebrow="Weather"
            title="The forecast, already priced into your plan"
            bullets={[
              "Heat, humidity and wind all change what a given pace costs you — and none of them settle until race week.",
              "We pull the hourly forecast for your start time and location, then layer it onto the elevation-adjusted plan.",
              "Heat that builds through the back half gets worked into your splits the same way a hill does.",
            ]}
            media={<WeatherStatBlock />}
          />

          <FeatureRow
            eyebrow="Race day"
            title="A band for your wrist, not a PDF for your phone"
            bullets={[
              "Every split printed at true wrist scale, ready to fold and wear.",
              "Fueling cues marked on the rows where they land, so you're not doing arithmetic at mile 20.",
              "Print it yourself for free, or order one on waterproof stock.",
            ]}
            media={<PaceBandPreview />}
          />
        </div>
      </section>

      <ClosingCta />
    </main>
    </HomeSelectionProvider>
  );
}
