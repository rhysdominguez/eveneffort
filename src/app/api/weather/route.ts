// Server-side proxy for the Tomorrow.io forecast. Keeps TOMORROW_IO_API_KEY on
// the server — the client only ever calls this internal route. On any failure
// (no key, bad params, upstream error) it responds with a JSON error and a
// non-200 status so the client can fall back to manual weather entry.
import { buildForecastUrl, selectHourlyConditions } from "@/lib/weather/forecast";

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
    const conditions = selectHourlyConditions(data, time);
    if (!conditions) {
      return Response.json(
        { error: "No forecast available for that time." },
        { status: 502 },
      );
    }

    return Response.json({ conditions });
  } catch {
    return Response.json(
      { error: "Failed to reach the weather service." },
      { status: 502 },
    );
  }
}
