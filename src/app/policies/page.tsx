import Link from "next/link";
import type { Metadata } from "next";
import {
  FULFILLMENT_WINDOW,
  PACEBAND_PRICE_LABEL,
  SUPPORT_EMAIL,
} from "@/lib/orders";

export const metadata: Metadata = {
  // Bare title — layout.tsx's template appends the "— eveneffort" suffix.
  title: "Shipping & refunds",
  description:
    "Shipping, refund and contact terms for the eveneffort printed paceband.",
  alternates: { canonical: "/policies" },
};

// Linked from the order card and set as the Terms URL in Stripe Checkout.
// Same prose layout as /methodology: single centered column, tokens only.
export default function PoliciesPage() {
  return (
    <main className="w-full flex-1">
      <section className="mx-auto w-full max-w-3xl px-6 py-16 space-y-12">
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium">
            Shipping &amp; refunds
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            The printed paceband
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            One product, {PACEBAND_PRICE_LABEL}, shipping included. Made by hand,
            one at a time. Here is exactly what that means.
          </p>
        </header>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            What you get
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            A single paceband carrying the elevation- and weather-adjusted
            splits you generated, printed on waterproof, tear-resistant stock
            and cut to wrap your wrist. If you supplied a name at checkout, it
            is printed on the band. This is the same plan you can print at home
            for free — you are paying for the durable version and for not having
            to make it yourself.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Shipping
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            Free, included in the price. United States only for now. Bands are
            posted within {FULFILLMENT_WINDOW} of your order and travel as
            standard mail, which typically arrives within a week of that.
            There is no tracking number. If your race is imminent, print the
            free version too — do not let the post be the thing between you and
            your splits.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Refunds
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            Full refund, no questions, any time before your band ships. After it
            ships: if it arrives damaged, illegible, or with the wrong splits,
            we will send a replacement or refund you in full — your choice, and
            you do not need to send anything back. Refunds go to the original
            card via Stripe and usually land within five to ten business days.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Payment and privacy
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            Payment is handled entirely by Stripe. Card details never touch
            eveneffort&rsquo;s servers. Stripe holds your email and shipping
            address so the band can be made and posted; it is not sold, shared,
            or used to market anything to you. The pacing app itself remains
            free and needs no account.
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-[var(--color-text-primary)]">
            Contact
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            Reply to your Stripe receipt, or write to{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-[var(--color-red-primary)] underline transition-colors hover:text-[var(--color-red-deep)]"
            >
              {SUPPORT_EMAIL}
            </a>
            . A human reads it.
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
