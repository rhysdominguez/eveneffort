"use client";
import { useEffect, useRef, useState } from "react";

// One Copy link button, shared by /results and /compare.
//
// Both pages used to keep the address bar in step with the form, which made
// sharing a side effect of the URL churning on every keystroke. Neither does
// any more, so this is the deliberate replacement: pressing it mints an
// absolute link describing the state on screen at that moment.
//
// Lives in one file rather than one per page because the two would otherwise
// drift on the part that is easy to get wrong: clipboard access is undefined
// outside a secure context, and the confirmation has to be announced rather
// than only shown.

type Status = "idle" | "copied" | "failed";

const LABEL: Record<Status, string> = {
  idle: "Copy link",
  copied: "Copied",
  failed: "Copy failed",
};

const RESET_MS = 2000;

export function CopyLinkButton({
  href,
  disabled = false,
  onCopied,
}: {
  /** Root-relative path, as buildResultsHref and buildCompareHref return. */
  href: string;
  disabled?: boolean;
  onCopied?: () => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending reset must not fire into an unmounted component.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function flash(next: Status) {
    setStatus(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), RESET_MS);
  }

  async function copy() {
    // Built at press time, not render time: the point of the button is that it
    // describes what is on screen now.
    const url = `${window.location.origin}${href}`;
    try {
      // A real branch, not defensive noise: navigator.clipboard is undefined
      // over plain http, which is every LAN preview of this app.
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      flash("copied");
      onCopied?.();
    } catch {
      flash("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled}
      title={LABEL[status]}
      className="flex items-center justify-center rounded-lg border border-[var(--color-border)] p-2.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[var(--color-text-secondary)]"
    >
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M8.75 11.25a3.25 3.25 0 0 0 4.6 0l2.4-2.4a3.25 3.25 0 0 0-4.6-4.6l-1.1 1.1" />
        <path d="M11.25 8.75a3.25 3.25 0 0 0-4.6 0l-2.4 2.4a3.25 3.25 0 0 0 4.6 4.6l1.1-1.1" />
      </svg>
      {/* Announced, not just shown: the only feedback a copy gives is this
          label changing, and a screen reader user gets nothing otherwise. */}
      <span className="sr-only" aria-live="polite">
        {LABEL[status]}
      </span>
    </button>
  );
}
