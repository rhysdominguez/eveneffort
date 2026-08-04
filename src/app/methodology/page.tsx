import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Why even effort, not even pace",
  description:
    "How eveneffort turns a goal time into splits: the Minetti (2002) energy cost curve, grade-adjusted pace, and race-day weather.",
  alternates: { canonical: "/methodology" },
};

// Static marketing/content page — no client state, no data fetching.
// Long-form copy, so it reads as prose rather than app UI: single centered
// column, generous vertical rhythm, tokens only (see globals.css).
export default function MethodologyPage() {
  return (
    <main className="w-full flex-1">
      <section className="mx-auto w-full max-w-3xl px-6 py-16 space-y-12">
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium">
            Our Methodology
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            Why even effort, not even pace
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            No marathon course is flat, and race day weather never cooperates.
            eveneffort plans for both, so mile 25 costs you what mile 1 did.
          </p>
        </header>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            The problem with even splits
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            Most calculators divide your goal time by the distance and give you
            the same split for every mile. That only works on flat ground in
            perfect conditions, which is to say it never really works. Holding
            pace up a climb costs you far more energy than holding it on the
            flat, and the descent on the other side doesn’t pay all of it back.
            So an even split plan quietly asks you to overspend on every hill,
            and it has no idea what the forecast looks like on race morning.
            As far as we can tell, no other race pace calculator corrects for a
            course’s real elevation profile and the live weather at the same
            time. That’s the gap we built eveneffort to close.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            How we build your paces
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            We hold effort steady instead of pace. It starts with the real
            elevation profile of your course, mapped from official course data,
            climb by climb and descent by descent. Published exercise
            physiology research tells us what each of those grades actually
            costs a runner in energy relative to flat ground, and that research
            was validated on real runners on real slopes. We use it to
            redistribute your goal time across the course. Paces ease a little
            on the way up and pick up a little on the way down, so the effort
            stays level even though the terrain doesn’t. Your goal finish time
            never changes. Only the way you spend it does.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Then we add the weather
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            Terrain is only half of it. Heat, humidity and wind all change what
            a given pace feels like, and none of them are settled until race
            week. When a forecast is available for your start time and
            location, we pull the hourly conditions for the hours you’ll be out
            there, including temperature, humidity, and wind speed and
            direction, then layer their effect onto the elevation adjusted
            plan. A headwind on an exposed stretch, or heat building through
            the back half, gets worked into your splits the same way a hill
            does, instead of ambushing you at mile 18.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            What you get
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            A pace chart built for the course and the conditions you’re
            actually going to run in, rather than an average that ignores both.
            Pace the effort, not the clock.
          </p>
        </div>

        <Link
          href="/"
          className="inline-block text-sm font-medium text-[var(--color-red-primary)] transition-colors hover:text-[var(--color-red-deep)]"
        >
          ← Back to start
        </Link>
      </section>
    </main>
  );
}
