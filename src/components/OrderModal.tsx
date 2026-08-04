"use client";
import { useState, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { startCheckout } from "@/lib/checkout";
import { track } from "@/lib/analytics";
import { PACEBAND_PRODUCT, PACEBAND_PRICE_LABEL } from "@/lib/orders";

// The paid path: order a printed band. Kept separate from PrintModal (the
// free path) so each modal stays small and focused instead of one dialog
// stacking both options. Open/close state lives in the caller (SummaryHeader)
// via usePopover, which owns Escape + outside-click dismissal — `panelRef` is
// that hook's containerRef, so a pointer-down on the backdrop counts as
// "outside" and closes.
interface Props {
  open: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  /** Serialized PacingInput; posted to /api/checkout so the order reproduces this exact band. */
  resultsQuery: string;
  onClose: () => void;
}

const eyebrowClass =
  "text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium";

export function OrderModal({ open, panelRef, resultsQuery, onClose }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  if (!open) return null;

  async function handleOrder() {
    track("order_clicked");
    setPending(true);
    setError(null);
    try {
      // Resolves only once the redirect to Stripe has been kicked off, so the
      // button stays disabled through navigation rather than flashing back.
      await startCheckout(resultsQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[var(--color-text-primary)]/40 p-4 print:hidden">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-modal-title"
        className="my-auto flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4">
          <h2
            id="order-modal-title"
            className="text-lg font-semibold text-[var(--color-text-primary)]"
          >
            Order the printed band
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-6 py-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className={eyebrowClass}>{PACEBAND_PRICE_LABEL}</span>
          </div>
          {/* Drop the photo at public/paceband-product.jpg. Until it exists
              the frame hides itself rather than showing a broken box, so the
              order flow can ship ahead of the photography. Fixed height +
              object-cover keeps the modal compact regardless of the photo's
              native aspect ratio. */}
          {!imageFailed && (
            <div className="relative h-40 w-full overflow-hidden rounded-lg border border-[var(--color-border)] sm:h-48">
              <Image
                src="/paceband-product.jpg"
                alt="A printed eveneffort paceband worn on a runner's wrist"
                fill
                sizes="(min-width: 640px) 448px, 100vw"
                onError={() => setImageFailed(true)}
                className="object-cover"
              />
            </div>
          )}
          <p className="text-sm text-[var(--color-text-secondary)]">
            {PACEBAND_PRODUCT.blurb}
          </p>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            {PACEBAND_PRODUCT.shipping} {PACEBAND_PRODUCT.fulfillment}{" "}
            <Link
              href="/policies"
              className="underline transition-colors hover:text-[var(--color-text-secondary)]"
            >
              Shipping &amp; refunds
            </Link>
          </p>
          <button
            type="button"
            onClick={handleOrder}
            disabled={pending}
            className="w-full rounded-lg bg-[var(--color-red-primary)] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-red-deep)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-tertiary)]"
          >
            {pending ? "Starting checkout…" : `Order for ${PACEBAND_PRICE_LABEL}`}
          </button>
          {error && (
            <p role="alert" className="text-sm text-[var(--color-red-primary)]">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
