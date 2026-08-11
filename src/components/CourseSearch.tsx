"use client";
import { useEffect, useState } from "react";
import { usePopover } from "@/hooks/usePopover";
import type { CourseId, CourseSummary } from "@/types";

// Replaces the native `<select>` the course was picked from. At a handful of
// majors a dropdown was fine; past a hundred courses the only workable control
// is one you can type into. Matching is on race name, city and country, since
// a runner is as likely to think "Munich" as "Munich Marathon".
//
// Unlike DatePicker/TimePicker — button triggers opening a `role="dialog"`
// panel — the visible control here IS the text input: typing is the first
// thing anyone does with a search field, so an extra click to open would buy
// nothing. That makes this the app's first true ARIA combobox.
interface Props {
  id: string;
  catalog: CourseSummary[];
  value: CourseId;
  onSelect: (nextId: CourseId) => void;
  placeholder?: string;
}

export function filterCourses(
  catalog: CourseSummary[],
  query: string,
): CourseSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog;
  return catalog.filter(
    (c) =>
      c.displayName.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.countryName.toLowerCase().includes(q),
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] px-4 py-3 pr-11 text-base focus:border-[var(--color-border-focus)] focus:outline-none transition-colors";

export function CourseSearch({
  id,
  catalog,
  value,
  onSelect,
  placeholder,
}: Props) {
  const { open, setOpen, containerRef } = usePopover();

  // `query` is the search text and only means anything while the list is
  // open; closed, the field shows the selected course's name. Deriving that
  // rather than syncing it into state keeps the resting label correct for
  // free when the course is chosen elsewhere on the page (a pin on the home
  // map, via InputForm's `requestedCourseId`).
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<CourseId | null>(null);

  const selectedName = catalog.find((c) => c.id === value)?.displayName ?? "";
  const filtered = filterCourses(catalog, query);

  useEffect(() => {
    if (!open || !activeId) return;
    document
      .getElementById(`${id}-option-${activeId}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeId, id]);

  // Opening clears the query rather than pre-selecting the current name: the
  // catalog is long and worth browsing, and filtering it down to the course
  // already chosen is the least useful list we could show.
  function openList() {
    setQuery("");
    setActiveId(value);
    setOpen(true);
  }

  function pick(nextId: CourseId) {
    onSelect(nextId);
    setQuery("");
    setActiveId(null);
    setOpen(false);
  }

  function move(delta: number) {
    if (filtered.length === 0) return;
    const current = filtered.findIndex((c) => c.id === activeId);
    const next = Math.min(Math.max(current + delta, 0), filtered.length - 1);
    setActiveId(filtered[next].id);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      // Never a form submit: button mode has its own Calculate button, and
      // swallowing Enter here is what makes keyboard selection possible.
      event.preventDefault();
      if (open && activeId && filtered.some((c) => c.id === activeId)) {
        pick(activeId);
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!open || filtered.length === 0) return;
      event.preventDefault();
      setActiveId(filtered[event.key === "Home" ? 0 : filtered.length - 1].id);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeId ? `${id}-option-${activeId}` : undefined
        }
        value={open ? query : selectedName}
        placeholder={placeholder ?? "Search races…"}
        onFocus={() => !open && openList()}
        onClick={() => !open && openList()}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          setActiveId(filterCourses(catalog, next)[0]?.id ?? null);
        }}
        onKeyDown={onKeyDown}
        className={inputClass}
      />
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <circle cx="8.75" cy="8.75" r="5.25" />
        <path d="M12.75 12.75L17 17" strokeLinecap="round" />
      </svg>

      {open && (
        <>
          <span className="sr-only" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "race" : "races"} found
          </span>
          <ul
            id={`${id}-listbox`}
            role="listbox"
            aria-label="Courses"
            className="absolute left-0 top-full z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-[var(--color-text-tertiary)]">
                No races match “{query}”
              </li>
            ) : (
              filtered.map((c) => {
                const isSelected = c.id === value;
                return (
                  <li
                    key={c.id}
                    id={`${id}-option-${c.id}`}
                    role="option"
                    aria-selected={isSelected}
                    // mousedown, not click: a click would blur the input first
                    // and the outside-click handler would close the list out
                    // from under the pointer.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(c.id);
                    }}
                    onMouseEnter={() => setActiveId(c.id)}
                    className={`cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors ${
                      isSelected
                        ? "bg-[var(--color-red-primary)] text-white"
                        : c.id === activeId
                          ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                          : "text-[var(--color-text-primary)]"
                    }`}
                  >
                    {c.displayName}
                    <span
                      className={
                        isSelected
                          ? "text-white/80"
                          : "text-[var(--color-text-tertiary)]"
                      }
                    >
                      {" · "}
                      {c.city}, {c.countryName}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </>
      )}
    </div>
  );
}
