"use client";
import { useState } from "react";
import { usePopover } from "@/hooks/usePopover";
import {
  MONTH_NAMES,
  WEEKDAY_LABELS,
  addMonths,
  formatDateDisplay,
  monthGrid,
  parseISODate,
  todayISO,
} from "@/lib/units/date";

// Replaces `<input type="date">`. The native control's calendar popup is
// OS-level chrome that CSS cannot reach, so it always looked foreign next to
// the rest of the app. This renders the same contract — a `YYYY-MM-DD` string
// in, the same string out — with the app's own tokens.
//
// Per DESIGN.md the popover is lifted with a 1px border, not a shadow.
interface Props {
  id: string;
  value: string; // "YYYY-MM-DD", or "" when unset
  onChange: (iso: string) => void;
  placeholder?: string;
  /**
   * Which side of the trigger the panel opens on. "top" is for the homepage
   * hero, where this field sits low enough in the band that opening downward
   * ran the calendar off the bottom of the photo. The dashboard sidebar has
   * room below and keeps the default.
   */
  placement?: "top" | "bottom";
}

const triggerClass =
  "w-full flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3 text-left text-base font-tabular text-[var(--color-text-primary)] focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

const navButtonClass =
  "flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]";

export function DatePicker({
  id,
  value,
  onChange,
  placeholder,
  placement = "bottom",
}: Props) {
  const { open, setOpen, close, containerRef, triggerRef } = usePopover();

  // Which month the grid is showing. Follows the selected date, falling back
  // to the current month when nothing is selected yet.
  const selected = parseISODate(value);
  const initialMonth = selected ?? parseISODate(todayISO())!;
  const [view, setView] = useState({
    year: initialMonth.year,
    month: initialMonth.month,
  });

  // Re-centre the grid on the selected month as the popover opens (done here
  // rather than in an effect, which would cascade an extra render).
  const openPicker = () => {
    const target = parseISODate(value) ?? parseISODate(todayISO())!;
    setView({ year: target.year, month: target.month });
    setOpen(true);
  };

  const today = todayISO();
  const cells = monthGrid(view.year, view.month);
  const monthPrefix = `${String(view.year).padStart(4, "0")}-${String(view.month).padStart(2, "0")}-`;

  const select = (iso: string) => {
    onChange(iso);
    close(true);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClass}
      >
        <span
          className={
            value ? "" : "font-sans text-[var(--color-text-tertiary)]"
          }
        >
          {value ? formatDateDisplay(value) : (placeholder ?? "Select a date")}
        </span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="2.5" y="4" width="15" height="13.5" rx="2" />
          <path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        // w-full rather than a fixed width: on desktop the sidebar is an
        // overflow container, so anything wider than the card gets clipped.
        // Deliberately compact: monthGrid is always 42 cells (6 fixed rows),
        // so this panel has a constant height and is the tallest thing the
        // form opens.
        <div
          role="dialog"
          aria-label="Choose race date"
          className={`absolute left-0 z-20 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 ${
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setView((v) => addMonths(v.year, v.month, -1))}
              className={navButtonClass}
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path
                  d="M12 4l-6 6 6 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {MONTH_NAMES[view.month - 1]} {view.year}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setView((v) => addMonths(v.year, v.month, 1))}
              className={navButtonClass}
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path
                  d="M8 4l6 6-6 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5">
            {WEEKDAY_LABELS.map((label) => (
              <span
                key={label}
                className="flex h-5 items-center justify-center text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
              >
                {label}
              </span>
            ))}
            {cells.map((iso) => {
              const inMonth = iso.startsWith(monthPrefix);
              const isSelected = iso === value;
              const isToday = iso === today;
              const day = Number(iso.slice(8));
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => select(iso)}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  className={`flex h-7 items-center justify-center rounded-lg text-sm font-tabular transition-colors ${
                    isSelected
                      ? "bg-[var(--color-red-primary)] text-white"
                      : inMonth
                        ? `text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] ${isToday ? "bg-[var(--color-bg-elevated)] font-medium" : ""}`
                        : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-elevated)]"
                  }`}
                >
                  {day}
                </button>
              );
            })}
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
              onClick={() => select(today)}
              className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
