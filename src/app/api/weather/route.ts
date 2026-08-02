// Server-side proxy for the Tomorrow.io forecast. Keeps TOMORROW_IO_API_KEY on
// the server — the client only ever calls this internal route. On any failure
// (no key, bad params, upstream error) it responds with a JSON error and a
// non-200 status so the client can fall back to manual weather entry.
import { buildForecastUrl, selectHourlyWindow } from "@/lib/weather/forecast";

export async function GET(request: Request): Promise<Response> {
  const apiKey = process.env.TOMORROW_IO_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Weather forecast is not configured." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const time = searchParams.get("time") ?? undefined;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json(
      { error: "Missing or invalid lat/lon." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(buildForecastUrl(lat, lon, apiKey), {
      headers: { accept: "application/json" },
      // Forecast changes slowly; cache briefly to stay within rate limits.
      next: { revalidate: 900 },
    });

    if (!upstream.ok) {
      return Response.json(
        { error: `Upstream weather error (${upstream.status}).` },
        { status: 502 },
      );
    }

    const data = await upstream.json();
    const hours = selectHourlyWindow(data, time);
    if (!hours || hours.length === 0) {
      // Not an upstream fault: the request succeeded, race day simply sits
      // outside Tomorrow.io's ~5-day hourly horizon (the common case, since
      // runners plan months ahead). 404 keeps it distinguishable from a 502 so
      // the UI can say "too far out" rather than "the service is down".
      return Response.json(
        {
          error:
            "Race day is outside the forecast range. Enter conditions manually.",
        },
        { status: 404 },
      );
    }

    // hours[i] = conditions i hours after the race start.
    return Response.json({ hours });
  } catch {
    return Response.json(
      { error: "Failed to reach the weather service." },
      { status: 502 },
    );
  }
}
