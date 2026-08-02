"use client";
import { useCallback, useEffect, useState } from "react";
import type { WeatherConditions } from "@/types";
import { zonedWallClockToUTC } from "@/lib/weather/timezone";

/**
 * Weather & Wind is a three-way choice, not an on/off switch layered with an
 * implicit "did the user touch a field" flag:
 * - "forecast": live conditions, fields are read-only.
 * - "manual": the runner enters conditions themselves, fields are editable.
 * - "off": the pacing engine ignores weather entirely.
 */
export type WeatherMode = "forecast" | "manual" | "off";

// Visible starting values when the user picks a mode with no data yet: cool,
// calm "ideal-adjacent" conditions. These are shown in the fields the moment
// a mode is selected — they are never applied invisibly.
const FALLBACK_CONDITIONS: WeatherConditions = {
  tempC: 15,
  humidity: 50,
  windSpeed: 0,
  windDirection: 0,
};

export interface UseWeather {
  mode: WeatherMode;
  setMode: (mode: WeatherMode) => void;
  /** True whenever weather affects the pacing engine — mode !== "off". */
  enabled: boolean;
  /** Start-line conditions (hour 0) — what the fields display (and, in manual mode, edit). */
  conditions: WeatherConditions | null;
  /**
   * Live forecast series at 1-hour steps from the race start (null when
   * manual — the engine then synthesizes a fall-morning progression).
   */
  hourly: WeatherConditions[] | null;
  loading: boolean;
  error: string | null;
  /** Patch one or more fields. Only meaningful in "manual" mode. */
  updateManual: (patch: Partial<WeatherConditions>) => void;
  /** Re-attempt the live forecast for the current course + timing. */
  refreshForecast: () => void;
}

/**
 * Weather state for the dashboard. Off by default: the pace chart is pure
 * elevation pacing until the user explicitly picks a mode. In "forecast"
 * mode a live forecast is attempted whenever the course start and race
 * date/time are set; otherwise the visible fallback defaults are shown
 * until timing is available. "manual" mode never fetches — the runner's own
 * entries are the source of truth.
 *
 * `initial` seeds conditions parsed from a shared URL — those arrive as
 * manual entry, so shared links reproduce the chart exactly.
 */
export function useWeather(
  start: { lat: number; lon: number; timezone: string },
  dateISO?: string,
  startTime?: string,
  initial?: WeatherConditions,
): UseWeather {
  const [mode, setModeState] = useState<WeatherMode>(
    initial !== undefined ? "manual" : "off",
  );
  const [conditions, setConditions] = useState<WeatherConditions | null>(
    initial ?? null,
  );
  const [hourly, setHourly] = useState<WeatherConditions[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (mode !== "forecast") return;
    if (!dateISO || !startTime) return;

    // The runner enters a wall clock at the course; the forecast is indexed by
    // absolute instants. Resolve one to the other in the course's own zone —
    // sending the naive string would select the wrong hours by the size of the
    // course's UTC offset.
    const iso = zonedWallClockToUTC(dateISO, startTime, start.timezone);
    if (!iso) return;
    const url = `/api/weather?lat=${start.lat}&lon=${start.lon}&time=${encodeURIComponent(iso)}`;
    let cancelled = false;

    // Wrapped in an async function so the loading/error state updates happen in
    // promise callbacks rather than synchronously in the effect body.
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "Forecast unavailable.");
        }
        if (cancelled) return;
        const hours = data.hours as WeatherConditions[];
        setHourly(hours);
        setConditions(hours[0]);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Forecast unavailable.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [mode, start.lat, start.lon, start.timezone, dateISO, startTime, reloadKey]);

  const setMode = useCallback((next: WeatherMode) => {
    setModeState(next);
    setError(null);
    if (next === "off") return;
    // Switching modes always starts from a clean forecast series — "manual"
    // has none, and "forecast" rebuilds its own via the effect above.
    setHourly(null);
    // Never on-but-empty: prefill the visible defaults so every value that
    // will affect the chart is on screen before it applies.
    setConditions((prev) => prev ?? FALLBACK_CONDITIONS);
  }, []);

  const updateManual = useCallback((patch: Partial<WeatherConditions>) => {
    setConditions((prev) => ({ ...(prev ?? FALLBACK_CONDITIONS), ...patch }));
  }, []);

  const refreshForecast = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return {
    mode,
    setMode,
    enabled: mode !== "off",
    conditions,
    hourly,
    loading,
    error,
    updateManual,
    refreshForecast,
  };
}
