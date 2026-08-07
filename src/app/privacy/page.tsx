import Link from "next/link";
import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/orders";
import { LEGAL_LAST_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  // Bare title — layout.tsx's template appends the "— eveneffort" suffix.
  title: "Privacy policy",
  description:
    "What eveneffort collects, what it doesn't, and which third parties are involved. No accounts, no tracking of your race plans.",
  alternates: { canonical: "/privacy" },
};

// Same prose layout as /methodology and /policies: single centered column,
// tokens only.
//
// Every claim here is checked against what the code actually does — the
// pacing engine is client-side (src/lib/pacing), the only outbound calls are
// /api/weather (course coordinates, not yours), /api/event (two event names,
// no identifiers) and /api/checkout (Stripe). Do not add a claim to this page
// without a matching line of code, and do not add a data flow without
// updating this page.
export default function PrivacyPage() {
  return (
    <main className="w-full flex-1">
      <section className="mx-auto w-full max-w-3xl px-6 py-16 space-y-12">
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium">
            Privacy policy
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            What we collect, and what we don&rsquo;t
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            There are no accounts here and no database of runners. Your goal
            time, your course and your body metrics are used to do maths in
            your browser, and then they are gone. Here is the whole picture.
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
        </header>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Your pacing plan never leaves your browser
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            The pacing calculation runs entirely on your device. Your goal
            finish time, chosen course, units, height and weight, and fueling
            target are held in the page while you use it and passed around in
            the URL so a results link stays shareable and refreshable. We do
            not store them, we do not log them, and there is no account they
            could ever be attached to. Close the tab and nothing about your
            plan survives on our side.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            We never ask for your location
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            The weather feature needs coordinates, but they are the{" "}
            <em>race course&rsquo;s</em> coordinates, not yours. When you pick
            the Boston Marathon, we look up the forecast for the Boston start
            line — a fixed point in our course data that is identical for every
            visitor. The site never requests browser geolocation permission and
            has no code that could. Those course coordinates and your chosen
            start time go to our forecast provider, Tomorrow.io, and nothing
            about you goes with them.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Analytics
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            We use Vercel Analytics to count page views, which reports
            aggregate traffic without cookies and without building a profile of
            individual visitors. Separately, we count two in-app moments — when
            the print dialog is opened and when someone clicks through to order
            a band — by writing the event name and a timestamp to our server
            log. No identifier, no IP address, and nothing about your pacing
            plan is attached to either one. They exist to tell us whether the
            band is worth continuing to make.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Advertising
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            The site carries Google AdSense, which keeps the calculator free.
            Google sets its own cookies and may use them and your device data
            to personalise the ads you see, under its own privacy policy rather
            than ours. We do not pass Google anything about your race, your
            goal time or your order. You can control ad personalisation at{" "}
            <a
              href="https://myadcenter.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-[var(--color-text-primary)]"
            >
              Google My Ad Center
            </a>
            , and an ad blocker will not break anything on this site.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            If you order a printed band
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            Ordering is the only part of the site that involves personal
            information, and it is handled by Stripe. You enter your name,
            email, shipping address and card details on Stripe&rsquo;s own
            checkout page. We never see or store your card number. What reaches
            us is what we need to make and post the band: your shipping
            details, the name you asked us to print, and the race and goal time
            the band is for. Stripe processes payments under its own privacy
            policy. We do not sell any of it, and we do not use it to market to
            you.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Your rights
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            Because we hold nothing about visitors who don&rsquo;t order, there
            is usually nothing to request, correct or delete. If you have
            ordered a band, email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="underline underline-offset-4 hover:text-[var(--color-text-primary)]"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            and we will tell you exactly what we hold, correct it, or delete it
            — subject to the order records we are required to keep for tax
            purposes. Depending on where you live you may have additional
            rights under the GDPR or CCPA; ask and we will honour them.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Children
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            This site is not directed at children under 13 and we do not
            knowingly collect anything from them.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Changes and contact
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            If this policy changes we will update the date at the top of the
            page. Questions about any of it go to{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="underline underline-offset-4 hover:text-[var(--color-text-primary)]"
            >
              {SUPPORT_EMAIL}
            </a>
            . See also our{" "}
            <Link
              href="/terms"
              className="underline underline-offset-4 hover:text-[var(--color-text-primary)]"
            >
              terms and conditions
            </Link>{" "}
            and{" "}
            <Link
              href="/policies"
              className="underline underline-offset-4 hover:text-[var(--color-text-primary)]"
            >
              shipping &amp; refunds
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
