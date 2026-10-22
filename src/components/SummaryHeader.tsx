"use client";
import { useRef, useState } from "react";
import { usePopover } from "@/hooks/usePopover";
import { PrintModal } from "@/components/PrintModal";
import { OrderModal } from "@/components/OrderModal";
import type { PacingResult } from "@/hooks/usePacingChart";
import type { CourseAltitude, CourseTerrain } from "@/types";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import { formatHMS } from "@/lib/units/time";
import { formatPace } from "@/lib/units/pace";
import { MARATHON_KM, MARATHON_MILES } from "@/lib/pacing/segments";
import { buildResultsHref, buildResultsQuery } from "@/lib/resultsParams";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { CourseOutline } from "@/components/CourseOutline";
import type { Outline } from "@/lib/course/outline";
import {
  CourseMapOverlay,
  prefetchCourseMap,
} from "@/components/CourseMapOverlay";
import { track } from "@/lib/analytics";
import type { HillSegment } from "@/types";

interface Props {
  result: PacingResult;
  courseName: string;
  location?: string;
  /** The course's climbing, for the difficulty badge under the name. */
  terrain?: CourseTerrain;
  /**
   * How high the course runs. Optional because, like `terrain`, it is derived
   * from geometry the printed paceband's own render path doesn't hold.
   *
   * Shown as its own pill beside the profile — see the header of
   * DifficultyBadge.tsx.
   */
  altitude?: CourseAltitude;
  /**
   * The course silhouette, drawn in the gap between the name and the buttons.
   * Optional the same way `terrain` is: an older seeded row, or an upload too
   * sparse to simplify, has no stored outline, and the band simply stays empty
   * rather than showing a placeholder frame.
   */
  outline?: Outline | null;
  /**
   * The 44-point elevation array and the named climbs, for the interactive map
   * (ROADMAP #22). Optional for the same reason `outline` is: the printed
   * paceband's render path does not hold geometry, and without them the map
   * entry points simply do not appear.
   */
  elevations?: number[];
  hills?: HillSegment[];
}

const eyebrowClass =
  "block text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium";

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
}) {
  return (
    <div>
      <span className={eyebrowClass}>{label}</span>
      <span className="mt-1 block text-2xl font-tabular font-medium text-[var(--color-text-primary)]">
        {value}
      </span>
      {note}
    </div>
  );
}

export function SummaryHeader({
  result,
  courseName,
  location,
  terrain,
  altitude,
  outline,
  elevations,
  hills,
}: Props) {
  const printPopover = usePopover();
  const orderPopover = usePopover();
  const mapPopover = usePopover();
  // Two triggers open one dialog, so focus return has to remember which. The
  // outline is hidden under `sm` and the icon button is always present, so
  // neither can stand in for the other.
  const outlineTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [openedFromOutline, setOpenedFromOutline] = useState(false);
  // The map needs geometry the paceband render path does not carry, so the
  // entry points are conditional on having all of it rather than on the
  // outline alone.
  const mappable = Boolean(outline && elevations && hills);
  const { goalTimeSeconds, unit } = result.input;
  const { adjustedFinishSeconds, weatherApplied } = result;
  const distance = unit === "km" ? MARATHON_KM : MARATHON_MILES;
  const avgPace = goalTimeSeconds / distance;
  const distanceLabel = `${distance.toFixed(2)} ${unit === "km" ? "km" : "mi"}`;

  // The weather-adjusted finish is only meaningful when weather is applied;
  // without it the value is identical to the goal, so we keep the row 3-up.
  const delta = adjustedFinishSeconds - goalTimeSeconds;
  const showAdjusted = weatherApplied;
  const showDelta = showAdjusted && Math.abs(delta) > 0.5;

  return (
    <header className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display tracking-tight text-[var(--color-text-primary)]">
            {courseName}
          </h2>
          {location && (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {location}
            </p>
          )}
          {/* What the ground does and how high it does it: altitude is
              invisible in a profile chart and in the Minetti curve alike.
              There was a third element here until 2026-09-20, a grey sentence
              ("Costs 0.6% less than a flat course"); the same number is the
              "vs flat" column on /courses. print:hidden with the rest of the
              chrome: the paceband carries splits, not commentary. */}
          {terrain && (
            <div className="mt-3 print:hidden">
              <DifficultyBadge terrain={terrain} altitude={altitude} />
            </div>
          )}
        </div>
        {/* The course's shape, sitting in the whitespace this row already
            had. It is decoration with a job: identity, not a statistic, which
            is why it is unlabelled and why it is centred in the slack rather
            than aligned to either end. min-w-0 so a wide, flat course
            letterboxes instead of pushing the buttons off the row, and
            print:hidden with the rest of the chrome. */}
        {outline && (
          <div className="hidden min-w-0 flex-1 justify-center sm:flex print:hidden">
            {mappable ? (
              // The silhouette becomes the map's main entry point: expanding
              // the shape already on screen is a more obvious gesture than any
              // icon, and it is why the overlay opens over that same outline.
              // The icon button in the row below exists because this one is
              // hidden under `sm`, where a phone would otherwise have none.
              <button
                ref={outlineTriggerRef}
                type="button"
                onClick={() => {
                  setOpenedFromOutline(true);
                  track("course_map_opened");
                  mapPopover.setOpen(true);
                }}
                onMouseEnter={prefetchCourseMap}
                onFocus={prefetchCourseMap}
                aria-haspopup="dialog"
                aria-expanded={mapPopover.open}
                className="flex min-w-0 flex-1 justify-center rounded-lg p-1 transition-colors hover:bg-[var(--color-bg-elevated)]"
              >
                {/* Hidden from the accessibility tree because the button's
                    own label already says what pressing it does. Left visible
                    it would prepend the outline's sentence-long description to
                    that label, and the control would announce as a paragraph. */}
                <span aria-hidden="true" className="min-w-0 flex-1">
                  <CourseOutline
                    outline={outline}
                    courseName={courseName}
                    className="h-20 w-full max-w-[160px]"
                  />
                </span>
                {/* NO EXPAND ICON. A plus badge used to fade in on hover in
                    the corner. Removed by decision on 2026-09-23: the hover
                    tint already says the shape is pressable, and a second
                    affordance on a 160px silhouette was competing with the
                    course for the space. The row below still carries an icon
                    button for anyone who needs a literal one, and the sr-only
                    label below is what actually names this control. */}
                <span className="sr-only">Open the full course map</span>
              </button>
            ) : (
              <CourseOutline
                outline={outline}
                courseName={courseName}
                className="h-20 w-full max-w-[160px]"
              />
            )}
          </div>
        )}
        {/* Three ways to take this plan away. Two are peer entry points to
            the paceband, each opening its own small modal instead of one
            dialog stacking both options: order the printed one, or print it
            here (PaceBand.tsx — everything else is print:hidden, so the
            browser dialog shows just the strip). Order is the paid CTA, so it
            gets the primary red treatment; the other two stay neutral chrome.

            Copy link is the third, and it is why the address bar is allowed to
            stop tracking the form: it serializes the CURRENT input through the
            same builder the order flow posts to Stripe, so a shared link and a
            bought band always describe the same chart. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {mappable && (
            <button
              ref={mapPopover.triggerRef}
              type="button"
              onClick={() => {
                setOpenedFromOutline(false);
                track("course_map_opened");
                mapPopover.setOpen(true);
              }}
              onMouseEnter={prefetchCourseMap}
              onFocus={prefetchCourseMap}
              aria-haspopup="dialog"
              aria-expanded={mapPopover.open}
              title="Course map"
              className="flex items-center justify-center rounded-lg border border-[var(--color-border)] p-2.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2.5 5.5 7.5 3l5 2.5 5-2.5v11l-5 2.5-5-2.5-5 2.5v-11Z" />
                <path d="M7.5 3v11M12.5 5.5v11" />
              </svg>
              <span className="sr-only">Course map</span>
            </button>
          )}
          <CopyLinkButton
            href={buildResultsHref(result.input)}
            onCopied={() => track("copy_link_clicked")}
          />
          <button
            ref={printPopover.triggerRef}
            type="button"
            onClick={() => {
              track("print_modal_opened");
              printPopover.setOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={printPopover.open}
            title="Print band"
            className="flex items-center justify-center rounded-lg border border-[var(--color-border)] p-2.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M5.5 7V3.5h9V7M5.5 14.5H4a1.5 1.5 0 0 1-1.5-1.5V8.5A1.5 1.5 0 0 1 4 7h12a1.5 1.5 0 0 1 1.5 1.5V13a1.5 1.5 0 0 1-1.5 1.5h-1.5" />
              <rect x="5.5" y="11.5" width="9" height="5" rx="0.5" />
            </svg>
            <span className="sr-only">Print band</span>
          </button>
          <button
            ref={orderPopover.triggerRef}
            type="button"
            onClick={() => {
              track("order_modal_opened");
              orderPopover.setOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={orderPopover.open}
            className="flex items-center gap-2 rounded-lg bg-[var(--color-red-fill)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-red-fill-hover)]"
          >
            Order band
          </button>
        </div>
      </div>
      <div
        className={`grid gap-6 border-t border-b border-[var(--color-border)] py-6 ${
          showAdjusted ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
        }`}
      >
        <Stat label="Goal time" value={formatHMS(goalTimeSeconds)} />
        {showAdjusted && (
          <Stat
            label="Adj. finish"
            value={formatHMS(adjustedFinishSeconds)}
            note={
              showDelta ? (
                <span
                  className={`mt-1 block text-sm font-tabular ${
                    delta > 0
                      ? "text-[var(--color-red-primary)]"
                      : "text-[var(--color-green-primary)]"
                  }`}
                >
                  {delta > 0 ? "+" : "−"}
                  {formatHMS(Math.abs(delta))} vs goal
                </span>
              ) : (
                <span className="mt-1 block text-sm text-[var(--color-text-tertiary)]">
                  Ideal conditions
                </span>
              )
            }
          />
        )}
        <Stat label="Average pace" value={formatPace(avgPace, unit)} />
        <Stat label="Distance" value={distanceLabel} />
      </div>
      <PrintModal
        open={printPopover.open}
        panelRef={printPopover.containerRef}
        onClose={() => printPopover.close(true)}
        onPrint={() => {
          printPopover.close(true);
          window.print();
        }}
      />
      {mappable && (
        <CourseMapOverlay
          open={mapPopover.open}
          panelRef={mapPopover.containerRef}
          onClose={() => {
            mapPopover.setOpen(false);
            const trigger = openedFromOutline
              ? outlineTriggerRef.current
              : mapPopover.triggerRef.current;
            trigger?.focus();
          }}
          courseName={courseName}
          outline={outline!}
          elevations={elevations!}
          hills={hills!}
          unit={unit}
          windMultipliers={result.windMultipliers}
          rows={result.rows}
          goalTimeSeconds={goalTimeSeconds}
          conditions={result.input.weather}
        />
      )}
      <OrderModal
        open={orderPopover.open}
        panelRef={orderPopover.containerRef}
        resultsQuery={buildResultsQuery(result.input)}
        onClose={() => orderPopover.close(true)}
      />
    </header>
  );
}
