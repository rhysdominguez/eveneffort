"use client";
import { useEffect, useRef } from "react";
import { usePopover } from "@/hooks/usePopover";
import {
  formatTimeDisplay,
  from24Hour,
  minuteOptions,
  parseTime,
  to24Hour,
  toHHMM,
} from "@/lib/units/date";

// Replaces `<input type="time">` for the same reason as DatePicker: the native
// clock popup is unstylable OS chrome. Three scrollable columns (hour, minute,
// meridiem) let any start time be hit in one or two clicks.
//
// Emits strictly zero-padded 24-hour "HH:MM" — `useWeather` concatenates this
// into an ISO timestamp without validating, so a stray "8:00" would silently
// resolve to the wrong forecast hour.
interface Props {
  id: string;
  value: string; // "HH:MM" 24h, or "" when unset
  onChange: (hhmm: string) => void;
  placeholder?: string;
  /** See DatePicker — "top" for the homepage hero, default for the sidebar. */
  placement?: "top" | "bottom";
}

const triggerClass =
  "w-full flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3 text-left text-base font-tabular text-[var(--color-text-primary)] focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

// The columns scroll, so their cap is purely how tall the panel is allowed to
// be — kept short so the popover clears the homepage hero band.
const columnClass =
  "max-h-32 flex-1 overflow-y-auto rounded-lg border border-[var(--color-border)] p-1";

// Default when the user opens the picker with nothing set: a typical race start.
const DEFAULT_HOUR_24 = 8;
const DEFAULT_MINUTE = 0;

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);

function optionClass(active: boolean): string {
  return `w-full rounded-lg px-2 py-1 text-sm font-tabular transition-colors ${
    active
      ? "bg-[var(--color-red-primary)] text-white"
      : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]"
  }`;
}

export function TimePicker({
  id,
  value,
  onChange,
  placeholder,
  placement = "bottom",
}: Props) {
  const { open, setOpen, close, containerRef, triggerRef } = usePopover();
  const hourColumnRef = useRef<HTMLDivElement | null>(null);

  const parsed = parseTime(value);
  const hour24 = parsed?.hour24 ?? DEFAULT_HOUR_24;
  const minute = parsed?.minute ?? DEFAULT_MINUTE;
  const { hour12, meridiem } = from24Hour(hour24);

  // Centre the selected hour when opening — otherwise a PM start sits below
  // the fold of the column. Setting scrollTop directly rather than calling
  // scrollIntoView, which would also scroll every scrollable ancestor and so
  // jump the (independently scrollable) sidebar this sits inside.
  useEffect(() => {
    if (!open) return;
    const column = hourColumnRef.current;
    const selected = column?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    if (!column || !selected) return;
    column.scrollTop =
      selected.offsetTop - column.clientHeight / 2 + selected.offsetHeight / 2;
  }, [open]);

  const commit = (h12: number, m: number, mer: "AM" | "PM") => {
    onChange(toHHMM(to24Hour(h12, mer), m));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClass}
      >
        <span
          className={
            value ? "" : "font-sans text-[var(--color-text-tertiary)]"
          }
        >
          {value ? formatTimeDisplay(value) : (placeholder ?? "Select a time")}
        </span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 5.75V10l2.75 2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose start time"
          className={`absolute left-0 z-20 w-full min-w-[15rem] rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 ${
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="flex gap-2">
            <div ref={hourColumnRef} className={columnClass}>
              {HOURS_12.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={h === hour12}
                  onClick={() => commit(h, minute, meridiem)}
                  className={optionClass(h === hour12)}
                >
                  {h}
                </button>
              ))}
            </div>

            <div className={columnClass}>
              {minuteOptions(minute).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={m === minute}
                  onClick={() => commit(hour12, m, meridiem)}
                  className={optionClass(m === minute)}
                >
                  {String(m).padStart(2, "0")}
                </button>
              ))}
            </div>

            <div className="flex flex-1 flex-col gap-1 rounded-lg border border-[var(--color-border)] p-1">
              {(["AM", "PM"] as const).map((mer) => (
                <button
                  key={mer}
                  type="button"
                  aria-pressed={mer === meridiem}
                  onClick={() => commit(hour12, minute, mer)}
                  className={optionClass(mer === meridiem)}
                >
                  {mer}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                close(true);
              }}
              className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
