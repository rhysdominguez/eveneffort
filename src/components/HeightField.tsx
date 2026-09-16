"use client";
import { useState } from "react";
import { NumericField, Stepper, fieldEyebrowClass, numericInputClass } from "@/components/NumericField";
import { UnitToggle } from "@/components/UnitToggle";
import type { HeightUnit } from "@/lib/units/weather";
import { cmToFeetInches, feetInchesToCm } from "@/lib/units/weather";
import { DEFAULT_BODY } from "@/types";

// Height input with its own unit toggle. Metric is a single absolute
// centimetre value; imperial is a feet + inches PAIR, because that's how
// height is actually spoken ("5 ft 9", never "68.9 inches").
//
// Canonical storage is always centimetres — the imperial pair is assembled and
// decomposed at this boundary only, so the drag model never sees feet.
interface Props {
  /** Canonical height in centimetres, or null when unset. */
  value: number | null;
  onChange: (heightCm: number | null) => void;
  unit: HeightUnit;
  onUnitChange: (unit: HeightUnit) => void;
  disabled?: boolean;
}

const toggle = (
  unit: HeightUnit,
  onUnitChange: (u: HeightUnit) => void,
  disabled: boolean,
) => (
  <UnitToggle
    label="Height unit"
    value={unit}
    options={[
      ["cm", "cm"],
      ["ftin", "ft"],
    ]}
    onChange={onUnitChange}
    disabled={disabled}
  />
);

/**
 * One half of the feet/inches pair. Buffered as text like NumericField so the
 * intermediate empty string is typeable, and re-synced from the canonical
 * value only while unfocused.
 */
function PartInput({
  id,
  caption,
  value,
  placeholder,
  blankBase,
  onCommit,
  disabled,
}: {
  id: string;
  caption: string;
  /** This part's whole number, or null while the height as a whole is unset. */
  value: number | null;
  /** Shown (greyed) while `value` is null — the matching part of the default
   *  height, so an untouched field reads "5 / 9" rather than "0 / 0". */
  placeholder?: string;
  /** Baseline the stepper works from while `value` is null, so the first
   *  click lands next to the default height rather than at 1. */
  blankBase?: number;
  onCommit: (n: number) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [focused, setFocused] = useState(false);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (!focused) setText(value === null ? "" : String(value));
  }

  // Mirrors the guard in onChange/onBlur below: this part of a height never
  // goes negative.
  const adjust = (delta: 1 | -1) => {
    const next = Math.max(0, (value ?? blankBase ?? 0) + delta);
    setText(String(next));
    onCommit(next);
  };

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          aria-label={caption}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            // Integers only — strip anything but digits.
            const raw = e.target.value.replace(/\D/g, "");
            setText(raw);
            const n = Number(raw);
            if (raw.trim() !== "" && Number.isFinite(n) && n >= 0) onCommit(n);
          }}
          onBlur={() => {
            setFocused(false);
            const n = Number(text);
            if (text.trim() !== "" && Number.isFinite(n) && n >= 0) {
              setText(String(n));
              onCommit(n);
            } else {
              setText(value === null ? "" : String(value));
            }
          }}
          className={`${numericInputClass} text-center`}
        />
        <Stepper label={caption} onStep={adjust} disabled={disabled} />
      </div>
      <span className={`mt-1 text-center ${fieldEyebrowClass}`}>{caption}</span>
    </div>
  );
}

export function HeightField({
  value,
  onChange,
  unit,
  onUnitChange,
  disabled = false,
}: Props) {
  if (unit === "cm") {
    return (
      <NumericField
        id="height"
        label="Height"
        labelAction={toggle(unit, onUnitChange, disabled)}
        value={value}
        onCommit={(n) => onChange(n)}
        disabled={disabled}
        placeholder={String(DEFAULT_BODY.heightCm)}
        min={0}
      />
    );
  }

  // An unset height shows the default (5 ft 9 in — the ft/in reading of the
  // same 175 cm the metric field placeholders) as greyed placeholders, and the
  // steppers work from it so the first click lands next to it rather than at
  // 1. A click on either part fills in the whole default, not just its half.
  const unset = value === null;
  const fallback = cmToFeetInches(DEFAULT_BODY.heightCm);
  const parts = unset ? null : cmToFeetInches(value);

  return (
    <div>
      <div className="mb-2 flex min-h-[1.25rem] items-center justify-between gap-2">
        <span className={fieldEyebrowClass}>Height</span>
        {toggle(unit, onUnitChange, disabled)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PartInput
          id="height-ft"
          caption="ft"
          value={parts ? parts.feet : null}
          placeholder={String(fallback.feet)}
          blankBase={fallback.feet}
          onCommit={(n) =>
            onChange(feetInchesToCm(n, parts ? parts.inches : fallback.inches))
          }
          disabled={disabled}
        />
        <PartInput
          id="height-in"
          caption="in"
          value={parts ? parts.inches : null}
          placeholder={String(fallback.inches)}
          blankBase={fallback.inches}
          onCommit={(n) =>
            onChange(feetInchesToCm(parts ? parts.feet : fallback.feet, n))
          }
          disabled={disabled}
        />
      </div>
    </div>
  );
}
