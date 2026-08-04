// The home page's closing band, and the ONLY red action on the page — the
// hero's Calculate button is the other one, and this is just a shortcut back
// up to it. Keeping it to one keeps red rare (DESIGN.md principle 2).
export function ClosingCta() {
  return (
    <section className="w-full border-t border-[var(--color-border)]">
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
          Even effort. The finish you planned for.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)]">
          Pick your race, set your goal time, and get splits that account for
          the course and the forecast. Free, and no account needed.
        </p>
        <a
          href="#calculator"
          className="mt-10 inline-block rounded-lg bg-[var(--color-red-primary)] px-10 py-4 text-base font-semibold text-[var(--color-bg-surface)] transition-colors hover:bg-[var(--color-red-deep)]"
        >
          Build my pacing plan
        </a>
      </div>
    </section>
  );
}
