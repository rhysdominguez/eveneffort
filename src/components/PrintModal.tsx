"use client";
import { useEffect, useRef, type RefObject } from "react";
import { AdSlot } from "@/components/AdSlot";

// The free path: print the band at home. Kept separate from OrderModal (the
// paid path) so each modal stays small and focused instead of one dialog
// stacking both options. Open/close state lives in the caller (SummaryHeader)
// via usePopover, which owns Escape + outside-click dismissal — `panelRef` is
// that hook's containerRef, so a pointer-down on the backdrop counts as
// "outside" and closes.
interface Props {
  open: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onPrint: () => void;
}

const eyebrowClass =
  "text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium";

function PrinterIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M5.5 7V3.5h9V7M5.5 14.5H4a1.5 1.5 0 0 1-1.5-1.5V8.5A1.5 1.5 0 0 1 4 7h12a1.5 1.5 0 0 1 1.5 1.5V13a1.5 1.5 0 0 1-1.5 1.5h-1.5" />
      <rect x="5.5" y="11.5" width="9" height="5" rx="0.5" />
    </svg>
  );
}

export function PrintModal({ open, panelRef, onClose, onPrint }: Props) {
  const printRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) printRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[var(--color-text-primary)]/40 p-4 print:hidden">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-modal-title"
        className="my-auto flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4">
          <h2
            id="print-modal-title"
            className="text-lg font-semibold text-[var(--color-text-primary)]"
          >
            Print it yourself
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
            <span className={eyebrowClass}>Free</span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            eveneffort is free and always will be. Checking out an ad keeps it
            that way.
          </p>
          <div className="space-y-2">
            <span className={`block text-center ${eyebrowClass}`}>
              Advertisement
            </span>
            <AdSlot />
          </div>
          <button
            ref={printRef}
            type="button"
            onClick={onPrint}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-6 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          >
            <PrinterIcon className="h-4 w-4 shrink-0" />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
