"use client";
import { useState } from "react";

// String-buffered numeric input. A plain controlled number input rejects the
// intermediate states you must pass through while typing — "", "-", "1." —
// which makes decimals and negatives effectively untypeable. This keeps the
// raw text locally and only commits finite parses upward.
//
// The buffer re-syncs when `value` changes externally (a forecast loading, or
// a metric/imperial toggle converting the number) but never while the field is
// focused, so an external update can't yank the caret mid-edit.
interface Props {
  id: string;
  label: string;
  value: number | null;
  onCommit: (n: number) => void;
  disabled?: boolean;
  /** Optional control (typically a UnitToggle) shown beside the label. */
  labelAction?: React.ReactNode;
  /** Shown when empty — used to surface the value assumed if left blank. */
  placeholder?: string;
  /** Amount the up/down stepper buttons add or remove per click. */
  step?: number;
  /**
   * Inclusive bounds. When `min` is 0 or higher, the minus key stops working
   * entirely — negative can't even be typed, not just clamped after the
   * fact. Leave both unset for fields where negative is physically valid
   * (temperature).
   */
  min?: number;
  max?: number;
}

export const fieldEyebrowClass =
  "block text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium";

/** Shared so composite fields (e.g. HeightField's ft/in pair) look identical.
 * The right padding reserves room for the stepper buttons docked there. */
export const numericInputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-3 py-2.5 pr-8 text-base font-tabular focus:border-[var(--color-border-focus)] focus:outline-none transition-colors disabled:bg-[var(--color-bg-elevated)] disabled:text-[var(--color-text-tertiary)]";

const eyebrowClass = fieldEyebrowClass;
const inputClass = numericInputClass;

/**
 * Up/down stepper buttons docked to the right edge of a numeric input.
 * Shared by NumericField and HeightField's ft/in pair so every counter in
 * the app looks and behaves identically.
 */
export function Stepper({
  label,
  onStep,
  disabled,
}: {
  label: string;
  onStep: (delta: 1 | -1) => void;
  disabled: boolean;
}) {
  const buttonClass =
    "flex flex-1 items-center justify-center text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="absolute inset-y-0 right-0 flex w-7 flex-col divide-y divide-[var(--color-border)] border-l border-[var(--color-border)]">
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Increase ${label}`}
        disabled={disabled}
        onClick={() => onStep(1)}
        className={buttonClass}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 12l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Decrease ${label}`}
        disabled={disabled}
        onClick={() => onStep(-1)}
        className={buttonClass}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 8l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

export function NumericField({
  id,
  label,
  value,
  onCommit,
  disabled = false,
  labelAction,
  placeholder,
  step = 1,
  min,
  max,
}: Props) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [focused, setFocused] = useState(false);

  // Adjusting state during render rather than in an effect — an effect here
  // would cascade an extra render on every external value change.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (!focused) setText(value === null ? "" : String(value));
  }

  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  const allowNegative = min === undefined || min < 0;

  // A blank field steps from 0 — the same baseline the placeholder implies.
  const adjust = (delta: 1 | -1) => {
    const next = clamp((value ?? 0) + delta * step);
    setText(String(next));
    onCommit(next);
  };

  return (
    <div>
      <div className="mb-2 flex min-h-[1.25rem] items-center justify-between gap-2">
        <label htmlFor={id} className={eyebrowClass}>
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            // Integers only. The minus key is stripped outright (not just
            // clamped afterward) whenever this field's domain is non-negative
            // — e.g. weight — so a value like -1 can never even be typed.
            const raw = e.target.value.replace(
              allowNegative ? /[^-\d]/g : /[^\d]/g,
              "",
            );
            const cleaned =
              allowNegative && raw.startsWith("-")
                ? "-" + raw.slice(1).replace(/-/g, "")
                : raw.replace(/-/g, "");
            setText(cleaned);
            const n = Number(cleaned);
            if (cleaned.trim() !== "" && cleaned !== "-" && Number.isFinite(n))
              onCommit(clamp(n));
          }}
          onBlur={() => {
            setFocused(false);
            const n = Number(text);
            if (text.trim() !== "" && text !== "-" && Number.isFinite(n)) {
              const clamped = clamp(n);
              setText(String(clamped));
              onCommit(clamped);
            } else {
              // Revert unparseable leftovers ("", "-") to the active value.
              setText(value === null ? "" : String(value));
            }
          }}
          className={inputClass}
        />
        <Stepper label={label} onStep={adjust} disabled={disabled} />
      </div>
    </div>
  );
}
