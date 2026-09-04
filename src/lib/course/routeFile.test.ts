// The route normaliser stands between an arbitrary course file and a permanent
// course slug, so its failure modes are the expensive kind: a silently wrong
// route ships geometry under an identifier that can never be reused (Rule 8).
// These tests pin the cases that would be wrong rather than merely broken —
// reversed axis order, joined tracks, dropped elevation.
//
// Pure and offline, so it runs in `npm run test` (Rule 9).

import { describe, expect, it } from "vitest";

import { RouteError, assertSingleTrack, dedupe, parseRouteFile, toGpx } from "./routeFile.ts";

const buf = (s: string) => Buffer.from(s, "utf8");

const gpxTrack = (body: string) =>
  `<?xml version="1.0"?><gpx version="1.1"><trk><name>Test Course</name><trkseg>${body}</trkseg></trk></gpx>`;

describe("parseRouteFile — GPX", () => {
  it("reads track points with elevation", () => {
    const route = parseRouteFile(
      buf(
        gpxTrack(
          `<trkpt lat="43.25" lon="-79.07"><ele>90.5</ele></trkpt>` +
            `<trkpt lat="43.26" lon="-79.08"><ele>91.5</ele></trkpt>`,
        ),
      ),
    );
    expect(route.format).toBe("gpx-trk");
    expect(route.name).toBe("Test Course");
    expect(route.points).toEqual([
      { lat: 43.25, lon: -79.07, ele: 90.5 },
      { lat: 43.26, lon: -79.08, ele: 91.5 },
    ]);
  });

  it("reports missing elevation as null rather than zero", () => {
    // Zero is a real elevation; conflating the two would put a sea-level course
    // and an unmeasured one in the same bucket.
    const route = parseRouteFile(
      buf(gpxTrack(`<trkpt lat="1" lon="2"></trkpt><trkpt lat="3" lon="4"><ele>0</ele></trkpt>`)),
    );
    expect(route.points.map((p) => p.ele)).toEqual([null, 0]);
  });

  it("accepts lon before lat, and self-closing points", () => {
    const route = parseRouteFile(
      buf(gpxTrack(`<trkpt lon="-79.07" lat="43.25" /><trkpt lat="43.26" lon="-79.08"/>`)),
    );
    expect(route.points).toEqual([
      { lat: 43.25, lon: -79.07, ele: null },
      { lat: 43.26, lon: -79.08, ele: null },
    ]);
  });

  it("falls back to <rte> when there are no track points", () => {
    // The case that makes an organiser's route export look like an empty file.
    const route = parseRouteFile(
      buf(
        `<?xml version="1.0"?><gpx version="1.1"><rte><name>R</name>` +
          `<rtept lat="43.25" lon="-79.07"><ele>90</ele></rtept>` +
          `<rtept lat="43.26" lon="-79.08"><ele>92</ele></rtept></rte></gpx>`,
      ),
    );
    expect(route.format).toBe("gpx-rte");
    expect(route.points).toHaveLength(2);
  });

  it("prefers track points over route points when a file has both", () => {
    const route = parseRouteFile(
      buf(
        `<?xml version="1.0"?><gpx version="1.1">` +
          `<rte><rtept lat="1" lon="1"/></rte>` +
          `<trk><trkseg><trkpt lat="43.25" lon="-79.07"/></trkseg></trk></gpx>`,
      ),
    );
    expect(route.format).toBe("gpx-trk");
    expect(route.points).toEqual([{ lat: 43.25, lon: -79.07, ele: null }]);
  });

  it("rejects a GPX with no geometry at all", () => {
    expect(() => parseRouteFile(buf(`<?xml version="1.0"?><gpx version="1.1"></gpx>`))).toThrow(
      RouteError,
    );
  });

  it("counts tracks and segments before flattening", () => {
    const route = parseRouteFile(
      buf(
        `<?xml version="1.0"?><gpx version="1.1">` +
          `<trk><trkseg><trkpt lat="1" lon="1"/></trkseg>` +
          `<trkseg><trkpt lat="2" lon="2"/></trkseg></trk>` +
          `<trk><trkseg><trkpt lat="3" lon="3"/></trkseg></trk></gpx>`,
      ),
    );
    expect(route.trackCount).toBe(2);
    expect(route.segmentCount).toBe(3);
    expect(route.points).toHaveLength(3);
  });
});

describe("parseRouteFile — KML and GeoJSON", () => {
  it("reads KML lon,lat,alt in the right order", () => {
    // Reversing these is how a Canadian course ends up in the Indian Ocean.
    const route = parseRouteFile(
      buf(
        `<?xml version="1.0"?><kml><Document><name>K</name><Placemark><LineString>` +
          `<coordinates>-79.07,43.25,90 -79.08,43.26,92</coordinates>` +
          `</LineString></Placemark></Document></kml>`,
      ),
    );
    expect(route.format).toBe("kml");
    expect(route.points).toEqual([
      { lat: 43.25, lon: -79.07, ele: 90 },
      { lat: 43.26, lon: -79.08, ele: 92 },
    ]);
  });

  it("handles KML coordinates with no altitude", () => {
    const route = parseRouteFile(
      buf(
        `<kml><Placemark><LineString><coordinates>-79.07,43.25 -79.08,43.26</coordinates>` +
          `</LineString></Placemark></kml>`,
      ),
    );
    expect(route.points.map((p) => p.ele)).toEqual([null, null]);
  });

  it("reads GeoJSON LineString, also lon-first", () => {
    const route = parseRouteFile(
      buf(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: [[-79.07, 43.25, 90], [-79.08, 43.26]] },
            },
          ],
        }),
      ),
    );
    expect(route.format).toBe("geojson");
    expect(route.points).toEqual([
      { lat: 43.25, lon: -79.07, ele: 90 },
      { lat: 43.26, lon: -79.08, ele: null },
    ]);
  });

  it("rejects an out-of-range coordinate", () => {
    // A swapped axis order usually shows up as a latitude above 90.
    expect(() =>
      parseRouteFile(buf(gpxTrack(`<trkpt lat="243.25" lon="-79.07"/>`))),
    ).toThrow(/out of range/);
  });

  it("rejects a format it cannot recognise", () => {
    expect(() => parseRouteFile(buf("mile 1: turn left"), "notes.txt")).toThrow(/unrecognised/);
  });
});

describe("assertSingleTrack", () => {
  const multi = {
    points: [],
    name: null,
    trackCount: 2,
    segmentCount: 2,
    format: "gpx-trk" as const,
  };

  it("refuses to flatten several tracks by default", () => {
    expect(() => assertSingleTrack(multi, false)).toThrow(/silently invent a route/);
  });

  it("allows the join only on an explicit opt-in", () => {
    expect(() => assertSingleTrack(multi, true)).not.toThrow();
  });

  it("passes a single-track route through", () => {
    expect(() => assertSingleTrack({ ...multi, trackCount: 1, segmentCount: 1 }, false)).not.toThrow();
  });
});

describe("dedupe", () => {
  it("drops only consecutive repeats", () => {
    const points = [
      { lat: 1, lon: 1, ele: 0 },
      { lat: 1, lon: 1, ele: 0 },
      { lat: 2, lon: 2, ele: 0 },
      { lat: 1, lon: 1, ele: 0 },
    ];
    // The final point revisits the start — an out-and-back, not a duplicate.
    expect(dedupe(points)).toHaveLength(3);
  });
});

describe("toGpx", () => {
  const points = [
    { lat: 43.25, lon: -79.07, ele: 90 },
    { lat: 43.26, lon: -79.08, ele: 92 },
  ];

  it("emits exactly one track and one segment", () => {
    const xml = toGpx(points, { name: "Test" });
    expect(xml.match(/<trk>/g)).toHaveLength(1);
    expect(xml.match(/<trkseg>/g)).toHaveLength(1);
    expect(xml.match(/<trkpt/g)).toHaveLength(2);
  });

  it("round-trips through the parser unchanged", () => {
    const reparsed = parseRouteFile(Buffer.from(toGpx(points, { name: "Test" })));
    expect(reparsed.points).toEqual(points);
  });

  it("writes provenance into the file", () => {
    const xml = toGpx(points, { name: "Test", provenance: ["elevation: dem:srtm30m"] });
    expect(xml).toContain("elevation: dem:srtm30m");
  });

  it("escapes a name that would otherwise break the XML", () => {
    const xml = toGpx(points, { name: `Bob & Sue's "Big" <Race>` });
    expect(xml).toContain("Bob &amp; Sue&apos;s &quot;Big&quot; &lt;Race&gt;");
    expect(() => parseRouteFile(Buffer.from(xml))).not.toThrow();
  });

  it("refuses to serialise a point with no elevation", () => {
    // parse_gpx.py would reject this too, but far later and less clearly.
    expect(() => toGpx([{ lat: 1, lon: 1, ele: null }], { name: "T" })).toThrow(
      /run the DEM stage/,
    );
  });
});
