"use client";

// Segmented control for picking a field's display unit.
//
// Two variants:
// - "compact" (default): NEUTRAL rather than red, sized to sit inline beside
//   a field label. DESIGN.md sanctions red for an active toggle, but the
//   stronger "keep red rare" principle wins here — several of these appear
//   at once, and red is reserved for consequential controls. See DESIGN.md.
// - "prominent": for the one unit toggle that sets the whole form's display
//   system (distance, km/mi) rather than a single field — sized and colored
//   like the weather On/Off switch (red when active) so it reads as a
//   top-level setting, not a per-field detail. Still a step down from
//   weather's own toggle since it's not quite as consequential.
interface Props<T extends string> {
  /** Accessible name for the group, e.g. "Temperature unit". */
  label: string;
  value: T;
  /** [value, visible label] pairs. */
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  disabled?: boolean;
  variant?: "compact" | "prominent";
}

export function UnitToggle<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  variant = "compact",
}: Props<T>) {
  const prominent = variant === "prominent";
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex overflow-hidden border border-[var(--color-border)] ${
        prominent ? "rounded-lg" : "rounded-md"
      } ${disabled ? "opacity-50" : ""}`}
    >
      {options.map(([optionValue, optionLabel]) => {
        const active = optionValue === value;
        return (
          <button
            key={optionValue}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(optionValue)}
            className={
              prominent
                ? `px-3 py-1 text-sm font-medium transition-colors ${
                    active
                      ? "bg-[var(--color-red-primary)] text-white"
                      : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
                  }`
                : `px-2 py-0.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                  }`
            }
          >
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}
