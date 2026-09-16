/**
 * The disclosure affordance on a native `<select>`.
 *
 * Every other arrow in the app is a stroked chevron — the calendar nav, the
 * numeric steppers, the section disclosures — so a filled `▾` glyph on the
 * dropdowns read as a different control drawn by a different hand. It also
 * inherits the font's own shape, which is why it landed heavier and lower
 * than everything around it. This is the same 1.75-stroke chevron DESIGN.md
 * specifies for the disclosure toggle, pointing down.
 *
 * Pair it with `appearance-none` on the select (so the OS arrow is gone),
 * right padding wide enough to clear it, and a `relative` wrapper.
 */
export function SelectChevron({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)] ${className}`}
    >
      <path d="M4.5 7.5 10 13l5.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
