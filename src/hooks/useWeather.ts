"use client";
import { useCallback, useEffect, useState } from "react";
import type { WeatherConditions } from "@/types";
import { zonedWallClockToUTC } from "@/lib/weather/timezone";
import { useStoredState } from "@/hooks/useStoredState";
import { WEATHER_MODE } from "@/lib/stateKeys";

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

/**
 * Where the auto-filled numbers came from. The mode is what the runner chose;
 * the source is what the server could actually answer with, and the two are
 * independent — "forecast" mode yields a historical source for a race that has
 * already been run.
 */
export type WeatherSource = "forecast" | "historical" | "typical";

/** What the panel needs to explain the numbers it is showing. */
export interface WeatherMeta {
  raceDateISO?: string;
  years?: number;
}

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
  /** Which of the three sources answered, or null before any fetch resolves. */
  source: WeatherSource | null;
  meta: WeatherMeta | null;
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
  /**
   * Force the climatology path. Set for a PAST date whose edition is only
   * `estimated` — derived from the series' recurrence rule rather than recorded
   * — where the true race day may be a week off the one we hold, and claiming
   * "these are the conditions on the day" would be a confident fiction.
   */
  preferTypical = false,
  /**
   * Remember the chosen mode across a reload. Opt-in so the hook stays pure for
   * any caller that doesn't want a shared session store — and so a single test
   * can exercise the fetch logic without touching storage.
   */
  persistMode = false,
): UseWeather {
  // Mode is the one weather setting the URL cannot carry. A shared /results
  // link spells out temp/humidity/wind as numbers, and those always parse back
  // as "manual" — so a runner who chose Forecast and then reloaded (or
  // cancelled a Stripe checkout, which returns as a cold page load) landed in
  // manual mode holding a frozen copy of the forecast they had asked to keep
  // live.
  //
  // Only "forecast" is ever restored. Restoring "manual" or "off" would let
  // stale session state contradict the query string, which IS authoritative for
  // everything it can express; restoring "forecast" only re-enables a fetch
  // that recomputes from scratch.
  const [storedMode, storeMode] = useStoredState(WEATHER_MODE);
  const [chosenMode, setChosenMode] = useState<WeatherMode | null>(null);
  const mode: WeatherMode =
    chosenMode ??
    (persistMode && storedMode === "forecast"
      ? "forecast"
      : initial !== undefined
        ? "manual"
        : "off");
  const [conditions, setConditions] = useState<WeatherConditions | null>(
    initial ?? null,
  );
  const [hourly, setHourly] = useState<WeatherConditions[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<WeatherSource | null>(null);
  const [meta, setMeta] = useState<WeatherMeta | null>(null);
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
    const url =
      `/api/weather?lat=${start.lat}&lon=${start.lon}&time=${encodeURIComponent(iso)}` +
      (preferTypical ? "&typical=1" : "");
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
        setSource((data.source as WeatherSource) ?? "forecast");
        setMeta((data.meta as WeatherMeta) ?? null);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Forecast unavailable.");
          setSource(null);
          setMeta(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [
    mode,
    start.lat,
    start.lon,
    start.timezone,
    dateISO,
    startTime,
    preferTypical,
    reloadKey,
  ]);

  const setMode = useCallback((next: WeatherMode) => {
    setChosenMode(next);
    if (persistMode) storeMode(next);
    setError(null);
    // Manual and Off have no source to speak of; forecast rebuilds its own.
    setSource(null);
    setMeta(null);
    if (next === "off") return;
    // Switching modes always starts from a clean forecast series — "manual"
    // has none, and "forecast" rebuilds its own via the effect above.
    setHourly(null);
    // Never on-but-empty: prefill the visible defaults so every value that
    // will affect the chart is on screen before it applies.
    setConditions((prev) => prev ?? FALLBACK_CONDITIONS);
  }, [persistMode, storeMode]);

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
    source,
    meta,
    updateManual,
    refreshForecast,
  };
}
