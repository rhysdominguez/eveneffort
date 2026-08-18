// Read a course file of whatever shape an organiser publishes, and write the
// single-track GPX that parse_gpx.py expects.
//
// The parser is fed, never modified — that rule is why this file exists. It
// accepts exactly one track with one segment (parse_gpx.py:77-95) and requires
// an <ele> on every point (:153-155). Organiser course files routinely satisfy
// neither: they are <rte> route exports, or KML from a Google My Maps page, or a
// GPX split into a track per mile, or coordinate-only with no elevation at all.
// Normalising here keeps all of that away from the locked parser.
//
// Regexes rather than an XML dependency, matching the reasoning in shared.ts:
// GPX and KML geometry is a flat, highly regular element list, and CLAUDE.md
// Rule 5 asks for a real justification before adding a library.

import { inflateRawSync } from "node:zlib";

export interface RoutePoint {
  lat: number;
  lon: number;
  /** null when the source published no elevation — see elevate.ts. */
  ele: number | null;
}

export interface Route {
  points: RoutePoint[];
  name: string | null;
  /** Container counts before flattening, so a caller can refuse a merge. */
  trackCount: number;
  segmentCount: number;
  /** Which branch produced this — reported to the human, and recorded. */
  format: "gpx-trk" | "gpx-rte" | "kml" | "geojson";
}

export class RouteError extends Error {}

const NUM = "[-+]?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?";

function toPoint(lat: string, lon: string, ele: string | null): RoutePoint {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) {
    throw new RouteError(`non-numeric coordinate (${lat}, ${lon})`);
  }
  if (la < -90 || la > 90 || lo < -180 || lo > 180) {
    throw new RouteError(`coordinate out of range (${la}, ${lo})`);
  }
  const e = ele === null ? null : Number(ele);
  return { lat: la, lon: lo, ele: e !== null && Number.isFinite(e) ? e : null };
}

/**
 * Pull <trkpt>/<rtept> elements out of a GPX fragment, in document order.
 *
 * Attributes are read by name rather than by position: GPX does not fix their
 * order and real exporters do emit lon before lat, which a positional pattern
 * silently reads as a course on the far side of the world.
 */
function readGpxPoints(fragment: string, tag: string): RoutePoint[] {
  const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}\\s*>)`, "gi");
  const attr = (attrs: string, name: string) =>
    attrs.match(new RegExp(`\\b${name}\\s*=\\s*["'](${NUM})["']`, "i"))?.[1] ?? null;

  const points: RoutePoint[] = [];
  for (const m of fragment.matchAll(re)) {
    const lat = attr(m[1], "lat");
    const lon = attr(m[1], "lon");
    if (lat === null || lon === null) {
      throw new RouteError(`<${tag}> is missing a lat or lon attribute`);
    }
    const ele = (m[2] ?? "").match(new RegExp(`<ele\\s*>\\s*(${NUM})\\s*</ele\\s*>`, "i"));
    points.push(toPoint(lat, lon, ele ? ele[1] : null));
  }
  return points;
}

function readName(xml: string): string | null {
  const m = xml.match(/<name\s*>([\s\S]*?)<\/name\s*>/i);
  if (!m) return null;
  const text = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  return text || null;
}

function parseGpx(xml: string): Route {
  const tracks = [...xml.matchAll(/<trk\b[^>]*>([\s\S]*?)<\/trk\s*>/gi)].map((m) => m[1]);
  const segments = tracks.flatMap((t) =>
    [...t.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg\s*>/gi)].map((m) => m[1]),
  );

  const trkPoints = segments.flatMap((s) => readGpxPoints(s, "trkpt"));
  if (trkPoints.length > 0) {
    return {
      points: trkPoints,
      name: readName(xml),
      trackCount: tracks.length,
      segmentCount: segments.length,
      format: "gpx-trk",
    };
  }

  // No track points. A <rte> export is a perfectly good course line that the
  // parser would otherwise see as an empty file.
  const routes = [...xml.matchAll(/<rte\b[^>]*>([\s\S]*?)<\/rte\s*>/gi)].map((m) => m[1]);
  const rtePoints = routes.flatMap((r) => readGpxPoints(r, "rtept"));
  if (rtePoints.length > 0) {
    return {
      points: rtePoints,
      name: readName(xml),
      trackCount: routes.length,
      segmentCount: routes.length,
      format: "gpx-rte",
    };
  }

  throw new RouteError("GPX contains no <trkpt> or <rtept> elements");
}

function parseKml(xml: string): Route {
  const lines = [...xml.matchAll(/<LineString\b[^>]*>([\s\S]*?)<\/LineString\s*>/gi)];
  if (lines.length === 0) throw new RouteError("KML contains no <LineString>");

  const perLine = lines.map((line) => {
    const coords = line[1].match(/<coordinates\s*>([\s\S]*?)<\/coordinates\s*>/i);
    if (!coords) return [];
    // KML is lon,lat[,alt] — the axis order is reversed relative to GPX, which
    // is the classic way to end up with a course in the wrong hemisphere.
    return coords[1]
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((triple) => {
        const [lon, lat, alt] = triple.split(",");
        if (lat === undefined) throw new RouteError(`malformed KML coordinate "${triple}"`);
        return toPoint(lat, lon, alt ?? null);
      });
  });

  return {
    points: perLine.flat(),
    name: readName(xml),
    trackCount: lines.length,
    segmentCount: lines.length,
    format: "kml",
  };
}

function parseGeoJson(text: string): Route {
  const doc = JSON.parse(text) as unknown;
  const strings: number[][][] = [];

  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "LineString" && Array.isArray(n.coordinates)) {
      strings.push(n.coordinates as number[][]);
    } else if (n.type === "MultiLineString" && Array.isArray(n.coordinates)) {
      for (const part of n.coordinates as number[][][]) strings.push(part);
    }
    for (const key of ["features", "geometry", "geometries"]) {
      const child = n[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child) walk(child);
    }
  };
  walk(doc);

  if (strings.length === 0) throw new RouteError("GeoJSON contains no LineString");

  return {
    points: strings.flatMap((coords) =>
      // GeoJSON is lon, lat[, alt] — same trap as KML.
      coords.map(([lon, lat, alt]) =>
        toPoint(String(lat), String(lon), alt === undefined ? null : String(alt)),
      ),
    ),
    name: null,
    trackCount: strings.length,
    segmentCount: strings.length,
    format: "geojson",
  };
}

/**
 * A KMZ is a zip whose first entry is the KML. Unpacked with zlib rather than a
 * zip dependency: we need exactly one member, and the local file header is a
 * fixed layout.
 */
function unwrapKmz(buf: Buffer): string {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new RouteError("not a KMZ (bad zip signature)");
  const method = buf.readUInt16LE(8);
  const compressedSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  const body = buf.subarray(start, start + compressedSize);
  if (method === 0) return body.toString("utf8");
  if (method === 8) return inflateRawSync(body).toString("utf8");
  throw new RouteError(`unsupported KMZ compression method ${method}`);
}

/** Dispatch on content, falling back to the filename. */
export function parseRouteFile(buf: Buffer, hint = ""): Route {
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {
    return parseKml(unwrapKmz(buf));
  }
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const head = text.slice(0, 4000);

  if (/<gpx[\s>]/i.test(head)) return parseGpx(text);
  if (/<kml[\s>]|<LineString[\s>]/i.test(head)) return parseKml(text);
  if (/^\s*[[{]/.test(head)) return parseGeoJson(text);

  // Content was inconclusive; the extension is the last hint we have.
  if (/\.gpx$/i.test(hint)) return parseGpx(text);
  if (/\.km[lz]$/i.test(hint)) return parseKml(text);
  if (/\.(json|geojson)$/i.test(hint)) return parseGeoJson(text);

  throw new RouteError(
    `unrecognised route format${hint ? ` for ${hint}` : ""} — expected GPX, KML/KMZ or GeoJSON`,
  );
}

/**
 * Reject a route the parser's single-track rule would have rejected, unless the
 * caller has explicitly signed off on joining the pieces.
 *
 * Same reasoning as check_track_structure: concatenating two tracks produces a
 * course that looks plausible in the output table and is not the real route. An
 * out-and-back published as two tracks is a legitimate merge; two different
 * distances in one file is not, and only a person can tell them apart.
 */
export function assertSingleTrack(route: Route, allowMerge: boolean): void {
  if (allowMerge) return;
  if (route.trackCount > 1 || route.segmentCount > 1) {
    throw new RouteError(
      `route has ${route.trackCount} track(s) / ${route.segmentCount} segment(s); ` +
        `flattening them would silently invent a route. Set "allowMerge": true for this ` +
        `entry only after checking the pieces really are one continuous course.`,
    );
  }
}

/** Drop consecutive duplicate points, which break nothing but inflate the file. */
export function dedupe(points: RoutePoint[]): RoutePoint[] {
  return points.filter(
    (p, i) => i === 0 || p.lat !== points[i - 1].lat || p.lon !== points[i - 1].lon,
  );
}

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );

/**
 * Serialise as a one-track, one-segment GPX. `provenance` is written into the
 * file as a comment so a course file on disk can always answer where its
 * geometry and its elevation came from.
 */
export function toGpx(
  points: RoutePoint[],
  meta: { name: string; provenance?: string[] },
): string {
  const missing = points.findIndex((p) => p.ele === null);
  if (missing >= 0) {
    throw new RouteError(
      `point ${missing} has no elevation — run the DEM stage before serialising`,
    );
  }
  const comment = (meta.provenance ?? []).map((l) => `  ${escapeXml(l)}`).join("\n");
  const body = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">` +
        `<ele>${p.ele!.toFixed(1)}</ele></trkpt>`,
    )
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    (comment ? `<!--\n${comment}\n-->\n` : "") +
    `<gpx version="1.1" creator="eveneffort-course-importer" ` +
    `xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <trk>\n    <name>${escapeXml(meta.name)}</name>\n    <trkseg>\n` +
    `${body}\n` +
    `    </trkseg>\n  </trk>\n</gpx>\n`
  );
}
