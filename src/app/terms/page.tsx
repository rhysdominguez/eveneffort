import Link from "next/link";
import type { Metadata } from "next";
import { PACEBAND_PRICE_LABEL, SUPPORT_EMAIL } from "@/lib/orders";
import { LEGAL_JURISDICTION, LEGAL_LAST_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  // Bare title — layout.tsx's template appends the "— eveneffort" suffix.
  title: "Terms and conditions",
  description:
    "The terms for using eveneffort's pacing calculator and ordering a printed paceband, including what the pacing model is and isn't.",
  alternates: { canonical: "/terms" },
};

// Same prose layout as /methodology, /policies and /privacy.
//
// The section that matters most here is "Pacing advice, not medical advice":
// this product tells people how hard to run, so the limits of the model and
// the runner's own responsibility have to be stated plainly rather than buried
// in a warranty paragraph.
export default function TermsPage() {
  return (
    <main className="w-full flex-1">
      <section className="mx-auto w-full max-w-3xl px-6 py-16 space-y-12">
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium">
            Terms and conditions
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            The deal, in plain language
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            Using eveneffort means accepting what follows. It is short, because
            the service is simple: we do some physiology maths, you decide how
            to run your race.
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
        </header>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            What the service is
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            eveneffort is a free calculator that redistributes a goal finish
            time across a marathon course according to its elevation profile
            and, where a forecast is available, the expected race-day weather.
            There is no account to create and nothing to subscribe to. We may
            change, add or remove features — including courses — at any time,
            and we may take the site down without notice.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Pacing advice, not medical advice
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            This is the part worth reading properly. The splits we produce are
            a mathematical model&rsquo;s estimate, not a training prescription
            and not medical advice. They assume the goal time you gave us is
            one you are actually fit to run; the model has no way to know
            otherwise, and it will happily build you a beautiful plan for a time
            beyond your current fitness. Fueling cues are generic guidance based
            on a carbohydrate target you set, not a nutrition plan for your
            body.
          </p>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            Running a marathon carries real risk of injury and, in rare cases,
            worse. You are responsible for your own training, pacing and safety
            on the day, and for deciding to slow down or stop regardless of what
            any band on your wrist says. Consult a doctor before starting
            endurance training, and follow the instructions of race officials
            and medical staff over ours. Conditions on the day — heat, wind, a
            course change, how you slept — will always outrank a plan made in
            advance.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Accuracy
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            We build each course from published elevation data and we work hard
            to get it right, but course routes change between editions, GPS
            elevation carries error, and weather forecasts are forecasts. The
            underlying energy-cost model is drawn from published research (see
            our{" "}
            <Link
              href="/methodology"
              className="underline underline-offset-4 hover:text-[var(--color-text-primary)]"
            >
              methodology
            </Link>
            ) and is a well-supported approximation of how gradient affects
            running economy — not a law of nature, and not tuned to you
            personally. We do not warrant that any split, adjusted finish time
            or forecast is accurate, and you should treat all of it as a
            starting point for your own judgement.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Printed bands
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            You can print a paceband yourself for free, forever. We also sell a
            physical one for {PACEBAND_PRICE_LABEL}, made by hand and posted to
            you. Payment is handled by Stripe, and placing an order means
            accepting our{" "}
            <Link
              href="/policies"
              className="underline underline-offset-4 hover:text-[var(--color-text-primary)]"
            >
              shipping &amp; refunds terms
            </Link>
            , which set out delivery times and how refunds work. Please check
            your goal time and course before ordering — each band is printed for
            one specific plan.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Acceptable use
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            Use the site for planning your own races. Don&rsquo;t attempt to
            disrupt it, scrape it at volume, or hammer the forecast endpoint —
            it sits on a rate-limited third-party API and abusing it degrades
            the site for other runners. Don&rsquo;t resell the pacing output as
            your own product.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Ownership
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            The site, its design, its written content and our course data
            compilation belong to us. The pace chart you generate is yours —
            print it, share it, wear it, no permission needed. The underlying
            research we build on belongs to its authors and is cited on the
            methodology page. Race names and trademarks belong to their
            respective organisers; we are not affiliated with, endorsed by, or
            sponsored by any marathon or race organisation.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Liability
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            The service is provided &ldquo;as is&rdquo;, without warranties of
            any kind, to the fullest extent the law allows. We are not liable
            for injury, a missed goal time, a bad race, or any indirect or
            consequential loss arising from using the site or a band. Where
            liability cannot be excluded, it is limited to what you actually
            paid us — which for most people is nothing. Some jurisdictions
            don&rsquo;t allow these exclusions, in which case they apply only as
            far as they legally can, and nothing here removes your statutory
            consumer rights.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Governing law and changes
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            These terms are governed by the laws of {LEGAL_JURISDICTION}. If
            they change we will update the date at the top of this page, and
            continuing to use the site means accepting the revised version.
            Questions go to{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="underline underline-offset-4 hover:text-[var(--color-text-primary)]"
            >
              {SUPPORT_EMAIL}
            </a>
            . See also our{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-[var(--color-text-primary)]"
            >
              privacy policy
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
