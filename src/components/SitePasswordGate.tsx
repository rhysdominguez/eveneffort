"use client";
import { useEffect, useState, type FormEvent } from "react";

// Gates the whole site behind one shared password, wrapping SiteChrome in
// the root layout so nothing renders past it, nav and footer included.
//
// Deliberately not real auth — a client-side string check anyone can read
// out of the bundle. That is intentional: nothing behind this needs to
// actually be secured, it just needs to stop a casual visitor from landing
// on the site while it's not meant to be public yet. See the password's own
// joke for the intended audience.
const SITE_PASSWORD = "groutexpectations";
const STORAGE_KEY = "siteUnlocked";

export function SitePasswordGate({ children }: { children: React.ReactNode }) {
  // Starts locked and flips open only after the sessionStorage check below,
  // so a returning visitor in the same tab session doesn't retype it on
  // every reload. This also means the very first server-rendered pass (and
  // anything reading raw HTML, like curl) sees the gate, not the site.
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [entry, setEntry] = useState("");
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "true") setUnlocked(true);
    } catch {
      // Storage blocked (private mode, etc.) — just fall through to asking.
    }
    setReady(true);
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (entry.trim().toLowerCase() === SITE_PASSWORD) {
      setUnlocked(true);
      setWrong(false);
      try {
        sessionStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // Nothing to persist to — the gate still opens for this render.
      }
    } else {
      setWrong(true);
    }
  }

  // Nothing paints until the sessionStorage check has run once, so an
  // already-unlocked visitor never sees a flash of the password form first.
  if (!ready) return null;

  if (unlocked) return <>{children}</>;

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-bg-footer-deep)] px-6">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-xs flex-col items-center gap-5"
      >
        <p className="text-xs font-light uppercase tracking-[0.35em] text-[var(--color-text-on-dark-muted)]">
          Enter the password
        </p>
        <input
          type="password"
          autoFocus
          value={entry}
          onChange={(event) => {
            setEntry(event.target.value);
            setWrong(false);
          }}
          aria-label="Password"
          className="w-full border-b border-[var(--color-border-on-dark)] bg-transparent py-2 text-center text-lg tracking-[0.2em] text-[var(--color-text-on-dark)] outline-none"
        />
        {wrong ? (
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-red-primary)]">
            That is not it.
          </p>
        ) : null}
        <button
          type="submit"
          className="text-xs font-light uppercase tracking-[0.35em] text-[var(--color-text-on-dark)] underline underline-offset-4"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
