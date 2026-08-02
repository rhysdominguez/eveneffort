"use client";
import { useState } from "react";
import { NumericField, Stepper, fieldEyebrowClass, numericInputClass } from "@/components/NumericField";
import { UnitToggle } from "@/components/UnitToggle";
import type { HeightUnit } from "@/lib/units/weather";
import { cmToFeetInches, feetInchesToCm } from "@/lib/units/weather";

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
  onCommit,
  disabled,
}: {
  id: string;
  caption: string;
  value: number;
  onCommit: (n: number) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (!focused) setText(String(value));
  }

  // Mirrors the guard in onChange/onBlur below: this part of a height never
  // goes negative.
  const adjust = (delta: 1 | -1) => {
    const next = Math.max(0, value + delta);
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
              setText(String(value));
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
        placeholder="175"
        min={0}
      />
    );
  }

  const { feet, inches } = cmToFeetInches(value ?? 0);

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
          value={feet}
          onCommit={(n) => onChange(feetInchesToCm(n, inches))}
          disabled={disabled}
        />
        <PartInput
          id="height-in"
          caption="in"
          value={inches}
          onCommit={(n) => onChange(feetInchesToCm(feet, n))}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
