"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WeatherConditions, WeatherSource } from "@/types";

const FALLBACK_CONDITIONS: WeatherConditions = {
  tempC: 15,
  humidity: 50,
  windSpeed: 0,
  windDirection: 0,
};

export interface UseWeather {
  conditions: WeatherConditions | null;
  source: WeatherSource;
  loading: boolean;
  error: string | null;
  /** Patch one or more fields — flips the source to manual entry. */
  updateManual: (patch: Partial<WeatherConditions>) => void;
  /** Re-attempt the live forecast for the current course + timing. */
  refreshForecast: () => void;
}

/**
 * Fetch the race-start forecast from the /api/weather proxy, with graceful
 * fallback to manual entry. A forecast is attempted whenever the course start
 * or race date/time changes (and the user hasn't taken manual control). Any
 * manual edit pins `source` to "manual" until the user refreshes the forecast.
 */
export function useWeather(
  start: { lat: number; lon: number },
  dateISO?: string,
  startTime?: string,
): UseWeather {
  const [conditions, setConditions] = useState<WeatherConditions | null>(null);
  const [source, setSource] = useState<WeatherSource>("forecast");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manualRef = useRef(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (manualRef.current) return;
    if (!dateISO || !startTime) return;

    const iso = `${dateISO}T${startTime}:00`;
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
        setConditions(data.conditions as WeatherConditions);
        setSource("forecast");
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
  }, [start.lat, start.lon, dateISO, startTime, reloadKey]);

  const updateManual = useCallback((patch: Partial<WeatherConditions>) => {
    manualRef.current = true;
    setSource("manual");
    setError(null);
    setConditions((prev) => ({ ...(prev ?? FALLBACK_CONDITIONS), ...patch }));
  }, []);

  const refreshForecast = useCallback(() => {
    manualRef.current = false;
    setReloadKey((k) => k + 1);
  }, []);

  return {
    conditions,
    source,
    loading,
    error,
    updateManual,
    refreshForecast,
  };
}
