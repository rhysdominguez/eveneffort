import Link from "next/link";
import type { Metadata } from "next";
import { FULFILLMENT_WINDOW, SUPPORT_EMAIL } from "@/lib/orders";

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

// Stripe only redirects here after a successful payment, so no session lookup
// is needed — there is no order database to reconcile against either. The band
// itself is made by hand from the order's metadata (see docs/FULFILLMENT.md).
export default function OrderSuccessPage() {
  return (
    <main className="w-full flex-1">
      <section className="mx-auto w-full max-w-2xl px-6 py-20 space-y-8">
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium">
            Order confirmed
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            Your band is on the way
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            Thank you — genuinely. Every band is printed, trimmed and posted by
            hand, and yours will be in the mail within {FULFILLMENT_WINDOW}.
          </p>
        </header>

        <div className="space-y-4 rounded-2xl border border-[var(--color-border)] p-6">
          <h2 className="font-display text-lg text-[var(--color-text-primary)]">
            What happens next
          </h2>
          <ul className="space-y-2 text-base leading-relaxed text-[var(--color-text-secondary)]">
            <li>
              Stripe has emailed you a receipt with your order details and
              shipping address.
            </li>
            <li>
              Your splits are printed exactly as you saw them, on waterproof,
              tear-resistant stock.
            </li>
            <li>
              Shipping is free and included. If anything is wrong — wrong
              splits, damaged in the post, or you simply changed your mind
              before it ships — reply to that receipt or write to{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[var(--color-red-primary)] underline transition-colors hover:text-[var(--color-red-deep)]"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              and we&rsquo;ll make it right.
            </li>
          </ul>
        </div>

        <p className="text-base text-[var(--color-text-secondary)]">
          One favour, if you have a moment: reply to the receipt and tell us
          what made you order a band rather than print one. It shapes what we
          build next.
        </p>

        <div className="flex flex-wrap gap-6">
          <Link
            href="/"
            className="text-sm font-medium text-[var(--color-red-primary)] transition-colors hover:text-[var(--color-red-deep)]"
          >
            ← Back to start
          </Link>
          <Link
            href="/policies"
            className="text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            Shipping &amp; refunds
          </Link>
        </div>
      </section>
    </main>
  );
}
