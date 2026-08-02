"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaceChartRow, Unit } from "@/types";
import { MILE_IN_KM } from "@/lib/pacing/segments";
import {
  distanceAtViewBoxX,
  nearestPointIndex,
  rowIndexForDistance,
  formatFeet,
  formatSignedFeet,
  formatChartDistance,
} from "@/lib/chart/geometry";

interface Props {
  /** Raw, dense [distanceKm, elevationM] trackpoints. Presentational only. */
  profile: [number, number][];
  unit: Unit;
  /** Pace rows, so the hover readout can name the pace for that stretch. */
  rows?: PaceChartRow[];
}

// SVG viewBox geometry. The chart scales to its container via width:100%.
// Height is DYNAMIC (see useMemo below) — it grows so the gap above the
// topmost gridline (base top margin included) matches the gap between any
// two gridlines, instead of being squeezed down to just the base margin.
const VB_W = 880;
const BASE_VB_H = 180;
// left margin has to fit the rotated "Feet" label AND the widest tick
// number (e.g. "-100") side by side without touching.
const M = { top: 8, right: 8, bottom: 18, left: 56 };
const PLOT_W = VB_W - M.left - M.right;
// Reference plot height — defines the pixel spacing between gridlines.
// Kept constant so adding top headroom never squeezes the existing chart.
const BASE_PLOT_H = BASE_VB_H - M.top - M.bottom;

const M_TO_FT = 3.28084;

// The vertical axis never spans less than this, even for pancake-flat
// courses — keeps small rolls from being visually exaggerated.
const MIN_SPAN_FT = 600;

// The axis is never allowed below this floor (a little below sea level
// is fine; deep negatives are not).
const MIN_FLOOR_FT = -100;

// Tooltip box metrics, in viewBox units (the chart renders ~1:1 at full width,
// so these read like px). Width is estimated from the character count — there
// is no way to measure text before layout in a hand-rolled SVG.
const TT_FONT = 11;
const TT_CHAR_W = 0.58;
const TT_PAD = 8;
const TT_GAP = 8;
const TT_H = 20;

/** Round a domain outward to a "nice" step so gridlines land on round numbers. */
function niceDomain(min: number, max: number): { lo: number; hi: number; step: number } {
  const span = Math.max(max - min, 1);
  const rawStep = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  return { lo, hi, step };
}

interface DragState {
  anchor: number;
  head: number;
}

export function ElevationChart({ profile, unit, rows }: Props) {
  const {
    points,
    distances,
    elevFt,
    maxDist,
    ticksY,
    ticksX,
    vbH,
    plotTop,
    plotBottom,
  } = useMemo(() => {
    // Elevation is always shown in feet, regardless of pace unit. Plot
    // every raw trackpoint — this is what gives the chart its ruggedness.
    const samples = profile.map(([distKm, elevM]) => ({
      distKm,
      elev: elevM * M_TO_FT,
    }));
    const maxDist = samples[samples.length - 1].distKm;

    const elevVals = samples.map((s) => s.elev);
    let dMin = Math.min(...elevVals);
    let dMax = Math.max(...elevVals);
    if (dMax - dMin < MIN_SPAN_FT) {
      const mid = (dMin + dMax) / 2;
      dMin = mid - MIN_SPAN_FT / 2;
      dMax = mid + MIN_SPAN_FT / 2;
    }
    // The axis never drops below the floor — slide the window up instead
    // of showing deep-negative elevation.
    if (dMin < MIN_FLOOR_FT) {
      dMax += MIN_FLOOR_FT - dMin;
      dMin = MIN_FLOOR_FT;
    }
    const nice = niceDomain(dMin, dMax);
    // niceDomain floors outward, which can dip below the floor — clamp it
    // so the axis bottom is never lower than MIN_FLOOR_FT.
    const lo = Math.max(nice.lo, MIN_FLOOR_FT);
    const { hi, step } = nice;

    // The gap above the topmost gridline (base top margin included) is a
    // fraction of one step's worth of pixels — the gap between any two
    // gridlines — rather than being squeezed down to just the base margin.
    const numSteps = Math.round((hi - lo) / step) || 1;
    const stepPx = BASE_PLOT_H / numSteps;
    const TOP_GAP_RATIO = 0.75;
    const plotTop = Math.max(stepPx * TOP_GAP_RATIO, M.top);
    const plotBottom = plotTop + BASE_PLOT_H;
    const vbH = plotBottom + M.bottom;

    const x = (d: number) => M.left + (d / maxDist) * PLOT_W;
    const y = (e: number) =>
      plotTop + BASE_PLOT_H - ((e - lo) / (hi - lo)) * BASE_PLOT_H;

    const points = samples.map((s) => ({ x: x(s.distKm), y: y(s.elev) }));

    const ticksY: { y: number; label: string }[] = [];
    for (let v = lo; v <= hi + 1e-6; v += step) {
      ticksY.push({ y: y(v), label: String(Math.round(v)) });
    }

    // X marks derived from distance: every 5 km, or every mile.
    const ticksX: { x: number; label: string }[] = [{ x: x(0), label: "S" }];
    if (unit === "km") {
      for (let km = 5; km <= maxDist + 1e-6; km += 5) {
        ticksX.push({ x: x(km), label: String(km) });
      }
    } else {
      for (let mi = 1; mi * MILE_IN_KM <= maxDist + 1e-6; mi++) {
        ticksX.push({ x: x(mi * MILE_IN_KM), label: String(mi) });
      }
    }

    return {
      points,
      distances: samples.map((s) => s.distKm),
      elevFt: elevVals,
      maxDist,
      ticksY,
      ticksX,
      vbH,
      plotTop,
      plotBottom,
    };
  }, [profile, unit]);

  // Paths are rebuilt from up to ~2900 points, so they must not be recomputed
  // on every mousemove-driven re-render.
  const { linePath, areaPath } = useMemo(() => {
    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${plotBottom} L${points[0].x.toFixed(1)},${plotBottom} Z`;
    return { linePath, areaPath };
  }, [points, plotBottom]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(
    null,
  );
  // Mirrors `drag` so the document-level mouseup can read the final head
  // without the listener effect re-subscribing on every pointer move.
  const dragRef = useRef<DragState | null>(null);

  // Any course/unit change invalidates indices into the old profile.
  useEffect(() => {
    setHoverIndex(null);
    setSelection(null);
    setDrag(null);
    dragRef.current = null;
  }, [profile, unit]);

  /** Nearest trackpoint index for a viewport x, or null if the chart isn't laid out. */
  const indexAtClientX = useCallback(
    (clientX: number): number | null => {
      const node = svgRef.current;
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      if (!rect.width) return null;
      // Uniform scale: the viewBox uses the default preserveAspectRatio and
      // the svg is width:100% with auto height.
      const svgX = (clientX - rect.left) * (VB_W / rect.width);
      const distKm = distanceAtViewBoxX(svgX, maxDist, M.left, PLOT_W);
      const idx = nearestPointIndex(distances, distKm);
      return idx < 0 ? null : idx;
    },
    [distances, maxDist],
  );

  const setDragHead = useCallback((head: number) => {
    setDrag((d) => {
      if (!d) return d;
      const next = { ...d, head };
      dragRef.current = next;
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setSelection(null);
  }, []);

  const startDrag = useCallback((idx: number) => {
    const next = { anchor: idx, head: idx };
    dragRef.current = next;
    setDrag(next);
    setSelection(null);
    setHoverIndex(idx);
  }, []);

  // Releasing drops the range entirely — the delta is a live readout, only
  // visible while the button is held, and the chart falls back to the plain
  // hover crosshair underneath the pointer.
  const finishDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setSelection(null);
  }, []);

  const dragging = drag !== null;

  // Listeners live on the document so the gesture survives the pointer
  // leaving the SVG, and are only attached while a drag is in flight.
  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (event: MouseEvent) => {
      const idx = indexAtClientX(event.clientX);
      if (idx === null) return;
      setHoverIndex(idx);
      setDragHead(idx);
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const idx = indexAtClientX(touch.clientX);
      if (idx === null) return;
      setHoverIndex(idx);
      setDragHead(idx);
    };
    const onEnd = () => finishDrag();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearAll();
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onTouchMove);
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dragging, indexAtClientX, setDragHead, finishDrag, clearAll]);

  // Escape also dismisses a committed selection, not just a live drag.
  useEffect(() => {
    if (!selection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selection]);

  const onMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const idx = indexAtClientX(event.clientX);
    if (idx !== null) setHoverIndex(idx);
  };
  const onMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
    // Stops the browser turning the drag into a text/image selection.
    event.preventDefault();
    const idx = indexAtClientX(event.clientX);
    if (idx !== null) startDrag(idx);
  };
  const onTouchStart = (event: React.TouchEvent<SVGSVGElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    const idx = indexAtClientX(touch.clientX);
    if (idx !== null) startDrag(idx);
  };

  // Keyboard equivalent. One arrow press covers ~1% of the course so a dense
  // 2900-point profile doesn't take thousands of presses to cross.
  const keyStep = Math.max(1, Math.round(points.length / 100));
  const keyAnchorRef = useRef<number | null>(null);

  const onKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const last = points.length - 1;
    const current = hoverIndex ?? 0;
    let head: number | null = null;

    if (event.key === "ArrowLeft") head = Math.max(0, current - keyStep);
    else if (event.key === "ArrowRight") head = Math.min(last, current + keyStep);
    else if (event.key === "Home") head = 0;
    else if (event.key === "End") head = last;
    else if (event.key === "Escape") {
      keyAnchorRef.current = null;
      setSelection(null);
      setHoverIndex(null);
      return;
    } else return;

    event.preventDefault();
    setHoverIndex(head);

    if (event.shiftKey) {
      const anchor = keyAnchorRef.current ?? selection?.from ?? current;
      keyAnchorRef.current = anchor;
      const from = Math.min(anchor, head);
      const to = Math.max(anchor, head);
      setSelection(from === to ? null : { from, to });
    } else {
      keyAnchorRef.current = null;
      setSelection(null);
    }
  };

  // What's on screen: a live drag wins over a committed selection.
  const range = drag
    ? { from: Math.min(drag.anchor, drag.head), to: Math.max(drag.anchor, drag.head) }
    : selection;
  const cursorIndex = drag ? drag.head : hoverIndex;

  const rangePath = useMemo(() => {
    if (!range || range.from === range.to) return null;
    const slice = points.slice(range.from, range.to + 1);
    const line = slice
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    return {
      line,
      area: `${line} L${slice[slice.length - 1].x.toFixed(1)},${plotBottom} L${slice[0].x.toFixed(1)},${plotBottom} Z`,
    };
  }, [points, range, plotBottom]);

  // Readout — the range delta replaces the point readout while one is active.
  let readoutParts: { text: string; fill: string; bold?: boolean }[] = [];
  let readoutAnchorX = 0;
  let liveText = "";

  if (range && range.from !== range.to) {
    const deltaFt = elevFt[range.to] - elevFt[range.from];
    const rounded = Math.round(deltaFt);
    // Colour tracks running effort, not "gain": an uphill drag reads red
    // (harder), a downhill drag reads green (easier) — inverted from the
    // stock-chart convention where up is always green.
    const fill =
      rounded > 0
        ? "var(--color-red-primary)"
        : rounded < 0
          ? "var(--color-green-primary)"
          : "var(--color-text-secondary)";
    const arrow = rounded > 0 ? " ↑" : rounded < 0 ? " ↓" : "";
    const span = `${formatChartDistance(distances[range.from], unit)} – ${formatChartDistance(distances[range.to], unit)}`;
    readoutParts = [
      { text: `${formatSignedFeet(deltaFt)}${arrow}`, fill, bold: true },
      { text: span, fill: "var(--color-text-tertiary)" },
    ];
    readoutAnchorX = (points[range.from].x + points[range.to].x) / 2;
    liveText = `Selected ${span}, elevation change ${formatSignedFeet(deltaFt)}.`;
  } else if (cursorIndex !== null) {
    const distKm = distances[cursorIndex];
    const paceLabel = rows?.length
      ? rows[rowIndexForDistance(distKm, unit, rows.length)]?.adjustedPaceLabel
      : undefined;
    readoutParts = [
      { text: formatFeet(elevFt[cursorIndex]), fill: "var(--color-text-primary)", bold: true },
      { text: formatChartDistance(distKm, unit), fill: "var(--color-text-tertiary)" },
    ];
    if (paceLabel) {
      readoutParts.push({ text: paceLabel, fill: "var(--color-text-secondary)" });
    }
    readoutAnchorX = points[cursorIndex].x;
    liveText = readoutParts.map((p) => p.text).join(", ");
  }

  const tooltipW =
    readoutParts.length > 0
      ? readoutParts.reduce((sum, p) => sum + p.text.length * TT_FONT * TT_CHAR_W, 0) +
        TT_GAP * (readoutParts.length - 1) +
        TT_PAD * 2
      : 0;
  const tooltipX = Math.min(
    Math.max(readoutAnchorX - tooltipW / 2, M.left + 2),
    VB_W - M.right - tooltipW - 2,
  );
  const tooltipY = plotTop + 4;

  return (
    <figure className="space-y-1">
      <figcaption className="text-lg font-semibold text-[var(--color-text-primary)]">
        Elevation profile
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${vbH}`}
        className={`w-full rounded-2xl border border-[var(--color-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] ${dragging ? "select-none" : ""}`}
        // pan-y keeps vertical page scrolling working on touch while a
        // horizontal drag selects a range.
        style={{ touchAction: "pan-y" }}
        tabIndex={0}
        aria-label="Course elevation profile. Hover or use the arrow keys to read a point; drag, or hold shift with the arrow keys, to select a range."
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onKeyDown={onKeyDown}
      >
        <rect
          x={0}
          y={0}
          width={VB_W}
          height={vbH}
          style={{ fill: "var(--color-bg-surface)" }}
        />

        {ticksY.map((t) => (
          <g key={`y${t.label}`}>
            <line
              x1={M.left}
              x2={VB_W - M.right}
              y1={t.y}
              y2={t.y}
              style={{ stroke: "var(--color-border)" }}
              strokeWidth={1}
            />
            <text
              x={M.left - 10}
              y={t.y}
              style={{ fill: "var(--color-text-tertiary)" }}
              fontSize={10}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {t.label}
            </text>
          </g>
        ))}

        <path d={areaPath} style={{ fill: "var(--color-bg-elevated)" }} />
        <path
          d={linePath}
          fill="none"
          style={{ stroke: "var(--color-text-primary)" }}
          strokeWidth={1.5}
        />

        {range && rangePath && (
          <g>
            <rect
              x={points[range.from].x}
              y={plotTop}
              width={Math.max(points[range.to].x - points[range.from].x, 0.5)}
              height={plotBottom - plotTop}
              style={{ fill: "var(--color-bg-elevated)" }}
            />
            <path
              d={rangePath.area}
              style={{ fill: "var(--color-text-tertiary)" }}
              opacity={0.25}
            />
            <path
              d={rangePath.line}
              fill="none"
              style={{ stroke: "var(--color-text-primary)" }}
              strokeWidth={2}
            />
            {[range.from, range.to].map((i) => (
              <g key={`handle${i}`}>
                <line
                  x1={points[i].x}
                  x2={points[i].x}
                  y1={plotTop}
                  y2={plotBottom}
                  style={{ stroke: "var(--color-text-tertiary)" }}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <circle
                  cx={points[i].x}
                  cy={points[i].y}
                  r={3}
                  style={{ fill: "var(--color-text-primary)" }}
                />
              </g>
            ))}
          </g>
        )}

        {cursorIndex !== null && !range && (
          <g>
            <line
              x1={points[cursorIndex].x}
              x2={points[cursorIndex].x}
              y1={plotTop}
              y2={plotBottom}
              style={{ stroke: "var(--color-text-tertiary)" }}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={points[cursorIndex].x}
              cy={points[cursorIndex].y}
              r={3}
              style={{ fill: "var(--color-text-primary)" }}
            />
          </g>
        )}

        {ticksX.map((t) => (
          <text
            key={`x${t.label}`}
            x={t.x}
            y={vbH - 5}
            style={{ fill: "var(--color-text-tertiary)" }}
            fontSize={10}
            textAnchor="middle"
          >
            {t.label}
          </text>
        ))}

        <text
          x={16}
          y={(plotTop + plotBottom) / 2}
          style={{ fill: "var(--color-text-tertiary)" }}
          fontSize={10}
          textAnchor="middle"
          transform={`rotate(-90 16 ${(plotTop + plotBottom) / 2})`}
        >
          Feet
        </text>

        {readoutParts.length > 0 && (
          <g pointerEvents="none">
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipW}
              height={TT_H}
              rx={6}
              style={{
                fill: "var(--color-bg-surface)",
                stroke: "var(--color-border)",
              }}
              strokeWidth={1}
            />
            <text
              x={tooltipX + TT_PAD}
              y={tooltipY + TT_H / 2}
              fontSize={TT_FONT}
              dominantBaseline="middle"
              className="font-tabular"
            >
              {readoutParts.map((p, i) => (
                // dx rather than a space: SVG collapses whitespace between tspans.
                <tspan
                  key={p.text}
                  dx={i === 0 ? 0 : TT_GAP}
                  style={{ fill: p.fill }}
                  fontWeight={p.bold ? 600 : 400}
                >
                  {p.text}
                </tspan>
              ))}
            </text>
          </g>
        )}
      </svg>
      <div className="sr-only" aria-live="polite">
        {liveText}
      </div>
    </figure>
  );
}
