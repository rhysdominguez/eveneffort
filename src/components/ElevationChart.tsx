import { useMemo } from "react";
import type { Unit } from "@/types";
import { MILE_IN_KM } from "@/lib/pacing/segments";

interface Props {
  /** Raw, dense [distanceKm, elevationM] trackpoints. Presentational only. */
  profile: [number, number][];
  unit: Unit;
}

// SVG viewBox geometry. The chart scales to its container via width:100%.
const VB_W = 880;
const VB_H = 180;
const M = { top: 8, right: 8, bottom: 18, left: 34 };
const PLOT_W = VB_W - M.left - M.right;
const PLOT_H = VB_H - M.top - M.bottom;

const M_TO_FT = 3.28084;

// The vertical axis never spans less than this, even for pancake-flat
// courses — keeps small rolls from being visually exaggerated.
const MIN_SPAN_FT = 600;

// The axis is never allowed below this floor (a little below sea level
// is fine; deep negatives are not).
const MIN_FLOOR_FT = -100;

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

export function ElevationChart({ profile, unit }: Props) {
  const { points, ticksY, ticksX } = useMemo(() => {
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

    const x = (d: number) => M.left + (d / maxDist) * PLOT_W;
    const y = (e: number) => M.top + PLOT_H - ((e - lo) / (hi - lo)) * PLOT_H;

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

    return { points, ticksY, ticksX };
  }, [profile, unit]);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const baseline = M.top + PLOT_H;
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${baseline} L${points[0].x.toFixed(1)},${baseline} Z`;

  return (
    <figure className="space-y-1">
      <figcaption className="text-lg font-semibold text-[var(--color-text-primary)]">
        Elevation profile
      </figcaption>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full rounded-2xl border border-[var(--color-border)]"
        role="img"
        aria-label="Course elevation profile"
      >
        <rect
          x={0}
          y={0}
          width={VB_W}
          height={VB_H}
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
              x={M.left - 6}
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

        {ticksX.map((t) => (
          <text
            key={`x${t.label}`}
            x={t.x}
            y={VB_H - 5}
            style={{ fill: "var(--color-text-tertiary)" }}
            fontSize={10}
            textAnchor="middle"
          >
            {t.label}
          </text>
        ))}

        <text
          x={10}
          y={M.top + PLOT_H / 2}
          style={{ fill: "var(--color-text-tertiary)" }}
          fontSize={10}
          textAnchor="middle"
          transform={`rotate(-90 10 ${M.top + PLOT_H / 2})`}
        >
          Feet
        </text>
      </svg>
    </figure>
  );
}
