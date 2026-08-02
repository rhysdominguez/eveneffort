"use client";
import { fieldEyebrowClass } from "@/components/NumericField";

// Labelled slider. Unlike NumericField there's no string buffer to manage —
// a range input can only ever hold a valid number, so it stays fully
// controlled off `value`.
//
// The track and thumb are styled by the `.range-input` class in globals.css;
// vendor pseudo-elements can't be reached from Tailwind utilities.
interface Props {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  /** Current value rendered beside the label, e.g. "60 g/hr". */
  valueLabel: string;
  /** Plain-language reading of what the value means, shown under the track. */
  hint?: string;
}

export function RangeField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
  valueLabel,
  hint,
}: Props) {
  return (
    <div>
      <div className="mb-2 flex min-h-[1.25rem] items-center justify-between gap-2">
        <label htmlFor={id} className={fieldEyebrowClass}>
          {label}
        </label>
        <span className="font-tabular text-base font-medium text-[var(--color-text-primary)]">
          {valueLabel}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-input"
      />
      {hint && (
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{hint}</p>
      )}
    </div>
  );
}
