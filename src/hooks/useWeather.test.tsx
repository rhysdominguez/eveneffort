import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useWeather } from "@/hooks/useWeather";

// Chicago's start line, and a race date far enough out that the live forecast
// genuinely cannot answer — the shape of the bug this file exists for.
const START = { lat: 41.8676, lon: -87.6236, timezone: "America/Chicago" };

function failing() {
  return vi.fn(async () =>
    new Response(JSON.stringify({ error: "Failed to reach the weather service." }), {
      status: 502,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("useWeather", () => {
  let fetchMock: ReturnType<typeof failing>;

  beforeEach(() => {
    fetchMock = failing();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("surfaces the error when the forecast cannot be fetched", async () => {
    const { result } = renderHook(() =>
      useWeather(START, "2026-10-11", "07:30"),
    );
    act(() => result.current.setMode("forecast"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.source).toBeNull();
  });

  // The regression: re-picking the mode you are already in cleared `error` and
  // `source` without re-running the fetch effect (its dep `mode` had not
  // changed), so the panel dropped "Forecast unavailable" and fell through to
  // "Showing the live forecast" over numbers no forecast had supplied.
  it("keeps the failure visible when Forecast is picked while already on Forecast", async () => {
    const { result } = renderHook(() =>
      useWeather(START, "2026-10-11", "07:30"),
    );
    act(() => result.current.setMode("forecast"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    const calls = fetchMock.mock.calls.length;

    act(() => result.current.setMode("forecast"));

    expect(result.current.mode).toBe("forecast");
    expect(result.current.error).toBeTruthy();
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("re-attempts, and fails again, on a manual round trip", async () => {
    const { result } = renderHook(() =>
      useWeather(START, "2026-10-11", "07:30"),
    );
    act(() => result.current.setMode("forecast"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    const calls = fetchMock.mock.calls.length;

    act(() => result.current.setMode("manual"));
    expect(result.current.error).toBeNull();

    act(() => result.current.setMode("forecast"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(fetchMock.mock.calls.length).toBe(calls + 1);
  });
});
