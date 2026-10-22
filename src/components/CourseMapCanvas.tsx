"use client";
import { useEffect, useRef } from "react";
import type { MapLayerMouseEvent, Map as MapLibreMap } from "maplibre-gl";
import type {
  MarkerKind,
  RouteHover,
  RouteMap,
  RouteSegmentProperties,
} from "@/lib/course/routeMap";
import {
  BASEMAP_STYLES,
  MAPLIBRE_WORKER_URL,
  readToken,
  styleFontStack,
} from "@/lib/map/basemap";
import { useTheme } from "@/hooks/useTheme";
import { readAppliedTheme, type Theme } from "@/lib/theme";

// The interactive course map's canvas (ROADMAP #22). A thin imperative wrapper
// around MapLibre, exactly like src/components/home/CourseMap.tsx: jsdom has no
// WebGL context, so anything worth asserting lives in src/lib/course/routeMap.ts
// and this file is kept to plumbing.
//
// WHY THE COLOURS ARE OPACITY AND NOT MORE COLOURS. The wind ramp needs to show
// strength, and the obvious way — a gradient from pale green through grey to
// deep red — would mean six or eight new colour tokens, each needing a
// hand-picked dark value, which is precisely the second ramp Rule 2 forbids
// (the six-stop difficulty ramp on DifficultyBadge is the one closed
// exception). So strength rides opacity and width on the two tokens the design
// system already sanctions as data marks: --color-green-primary for a tailwind,
// --color-red-primary for a headwind. Over a near-white or near-black basemap
// with no colour of its own, opacity reads as density, which is the thing the
// reference design was actually communicating.
//
// NEUTRAL IS NOT TRANSPARENT. A split whose wind cannot move its printed pace
// by a second draws in --color-text-secondary at a fixed opacity. It has to
// stay clearly visible: the route is the subject of the map, and a course on a
// calm day would otherwise vanish entirely. Secondary rather than tertiary
// because tertiary (#A3A3A3) sat within a few percent of the basemap's own
// road and landuse greys, so on a calm forecast the line read as another
// street. Secondary is the darker grey in light mode AND the lighter one in
// dark mode, which is the direction that separates it from the tiles in both.

const SOURCE_ROUTE = "route";
const SOURCE_MARKERS = "route-markers";
const SOURCE_HILLS = "route-hills";
const LAYER_HILLS = "route-hills-line";
const LAYER_ROUTE = "route-line";
const LAYER_MARKER_DOTS = "route-marker-dots";
const LAYER_MARKER_LABELS = "route-marker-labels";
const LAYER_ENDS = "route-ends";

/** Fixed opacity for a split the wind does not meaningfully change. */
const NEUTRAL_OPACITY = 0.85;

interface Props {
  routeMap: RouteMap;
  /** Draws the named climbs (ROADMAP #13) as a casing under the route. */
  showHills: boolean;
  /**
   * Called with the split, or the start/finish marker, under the pointer, or
   * null when it leaves either.
   */
  onHover: (hover: RouteHover) => void;
  /** Fired once the basemap has drawn, so the caller can retire the outline. */
  onReady: () => void;
  /**
   * Fired when the map cannot be built or cannot draw. Without this the
   * failure mode is a full screen of blank surface colour with no explanation,
   * which is how this component shipped the first time and is not acceptable
   * for something a runner opened deliberately.
   */
  onError: (message: string) => void;
}

export function CourseMapCanvas({
  routeMap,
  showHills,
  onHover,
  onReady,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const basemapThemeRef = useRef<Theme | null>(null);
  const [theme] = useTheme();

  // Read at event time, so the effect below depends only on the data and a
  // parent re-render can never tear the map down mid-pan.
  const onHoverRef = useRef(onHover);
  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const routeRef = useRef(routeMap);
  routeRef.current = routeMap;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    // The split currently under the pointer, so its highlight can be cleared
    // without re-querying the map.
    let hoveredId: number | null = null;
    let observer: ResizeObserver | null = null;

    async function build() {
      // Namespace import, not default: maplibre-gl v6 dropped its default
      // export. Imported here rather than at module scope so /results never
      // pays ~200 KB for a map the runner may never open.
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container) return;

      maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);

      // The theme as the document has it NOW: this build is async, so the
      // hook's captured value can already be stale.
      const initialTheme = readAppliedTheme();
      basemapThemeRef.current = initialTheme;

      const map = new maplibregl.Map({
        container,
        style: BASEMAP_STYLES[initialTheme],
        bounds: routeRef.current.bounds,
        fitBoundsOptions: { padding: 72, duration: 0 },
        // Unlike the homepage map, this one IS the page while it is open.
        // There is nothing behind it to scroll, so swallowing the wheel is the
        // correct behaviour rather than a trap.
        cooperativeGestures: false,
        attributionControl: { compact: true },
      });
      mapRef.current = map;

      // MEASURED LATE, ON PURPOSE. MapLibre reads the container's size once, at
      // construction. This map is built inside an overlay that mounts in the
      // same commit, so that reading can land before the browser has laid the
      // container out, and a map that measured 0x0 draws nothing at all: no
      // tiles, no route, and its controls sit inside a zero-size box, so the
      // whole thing is an unexplained blank rectangle. The observer re-measures
      // whenever the box actually changes, which also covers a window resize
      // and a phone rotating while the map is open.
      observer = new ResizeObserver(() => {
        if (!cancelled) map.resize();
      });
      observer.observe(container);

      // Anything MapLibre reports that would otherwise be swallowed: a style
      // that will not parse, a tile endpoint that is refusing, a missing
      // worker. Surfaced rather than logged, because the visible symptom of
      // every one of them is the same blank screen.
      map.on("error", (event: { error?: { message?: string } }) => {
        if (cancelled) return;
        onErrorRef.current(
          event.error?.message ?? "The map could not be loaded.",
        );
      });

      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );

      // Sources and layers live in the STYLE, and a theme change's `setStyle`
      // discards the lot, so they are added on every `style.load` including the
      // first. Colours are read here for the same reason: they are the theme's.
      map.on("style.load", () => {
        if (cancelled || map.getSource(SOURCE_ROUTE)) return;

        const data = routeRef.current;
        const red = readToken("--color-red-primary", "#B91C1C");
        const green = readToken("--color-green-primary", "#15803D");
        const neutral = readToken("--color-text-secondary", "#525252");
        const primary = readToken("--color-text-primary", "#0A0A0A");
        const surface = readToken("--color-bg-surface", "#FFFFFF");

        map.addSource(SOURCE_HILLS, { type: "geojson", data: data.hills });
        map.addSource(SOURCE_ROUTE, { type: "geojson", data: data.route });
        map.addSource(SOURCE_MARKERS, { type: "geojson", data: data.markers });

        // A wide, faint casing under the route rather than a colour of its
        // own: the climbs are context for the wind line, not a competing
        // dataset, and a second saturated colour here would break Rule 2.
        map.addLayer({
          id: LAYER_HILLS,
          type: "line",
          source: SOURCE_HILLS,
          layout: {
            "line-cap": "round",
            "line-join": "round",
            visibility: showHills ? "visible" : "none",
          },
          paint: {
            "line-color": primary,
            "line-opacity": 0.18,
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 8, 14, 18],
          },
        });

        map.addLayer({
          id: LAYER_ROUTE,
          type: "line",
          source: SOURCE_ROUTE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": [
              "match",
              ["get", "tone"],
              "head",
              red,
              "tail",
              green,
              neutral,
            ],
            // Neutral carries a fixed opacity; everything else rides the ramp
            // built in routeMap.ts, where the thresholds are explained.
            "line-opacity": [
              "case",
              ["==", ["get", "tone"], "neutral"],
              NEUTRAL_OPACITY,
              ["get", "intensity"],
            ],
            // Strength shows in weight as well as density, and the hovered
            // split thickens so the pointer has visible feedback on a line
            // that is otherwise only distinguishable by colour.
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                5,
                ["+", 2, ["*", 1.5, ["get", "intensity"]]],
              ],
              14,
              [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                11,
                ["+", 5, ["*", 4, ["get", "intensity"]]],
              ],
            ],
          },
        });

        map.addLayer({
          id: LAYER_MARKER_DOTS,
          type: "circle",
          source: SOURCE_MARKERS,
          filter: ["==", ["get", "kind"], "distance"],
          paint: {
            "circle-color": surface,
            "circle-radius": 9,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": primary,
          },
        });

        const fontStack = styleFontStack(map);
        map.addLayer({
          id: LAYER_MARKER_LABELS,
          type: "symbol",
          source: SOURCE_MARKERS,
          filter: ["==", ["get", "kind"], "distance"],
          layout: {
            "text-field": ["get", "label"],
            ...(fontStack ? { "text-font": fontStack } : {}),
            "text-size": 11,
            "text-allow-overlap": true,
          },
          paint: { "text-color": primary },
        });

        // Green starts, red finishes — the same convention as CourseOutline,
        // and as every route map anywhere.
        map.addLayer({
          id: LAYER_ENDS,
          type: "circle",
          source: SOURCE_MARKERS,
          filter: ["!=", ["get", "kind"], "distance"],
          paint: {
            "circle-color": [
              "match",
              ["get", "kind"],
              "start",
              green,
              "finish",
              red,
              neutral,
            ],
            "circle-radius": 8,
            "circle-stroke-width": 2,
            "circle-stroke-color": surface,
          },
        });
      });

      // `load` fires once the style and its first tiles are in. That is the
      // moment the static outline standing in behind this canvas has something
      // real to hand over to.
      map.on("load", () => {
        if (cancelled) return;
        // One forced re-measure on load as well as through the observer: if
        // the container was already at its final size, the observer's first
        // callback and this are the same no-op, and if it was not, this is the
        // one that rescues the very first paint.
        map.resize();
        onReadyRef.current();
      });

      // Handlers are keyed by layer id and live on the map rather than on the
      // style, so they survive a theme swap and are registered once.
      const clearHover = () => {
        if (hoveredId !== null) {
          map.setFeatureState(
            { source: SOURCE_ROUTE, id: hoveredId },
            { hover: false },
          );
          hoveredId = null;
        }
        onHoverRef.current(null);
      };

      map.on("mousemove", LAYER_ROUTE, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature || feature.id === undefined) return;
        const id = Number(feature.id);
        if (id !== hoveredId) {
          if (hoveredId !== null) {
            map.setFeatureState(
              { source: SOURCE_ROUTE, id: hoveredId },
              { hover: false },
            );
          }
          hoveredId = id;
          map.setFeatureState({ source: SOURCE_ROUTE, id }, { hover: true });
        }
        map.getCanvas().style.cursor = "pointer";
        onHoverRef.current(
          feature.properties as unknown as RouteSegmentProperties,
        );
      });

      map.on("mouseleave", LAYER_ROUTE, () => {
        map.getCanvas().style.cursor = "";
        clearHover();
      });

      // Touch has no hover, so a tap is the same gesture. It does not clear on
      // touchend: the readout should stay up long enough to be read.
      map.on("click", LAYER_ROUTE, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (feature) {
          onHoverRef.current(
            feature.properties as unknown as RouteSegmentProperties,
          );
        }
      });

      // The start and finish dots, same readout wired to a different layer.
      // No feature-state highlight here: unlike a split there is nothing on
      // the dot itself to thicken, and it is already the biggest mark on the
      // route.
      const endpointKind = (
        e: MapLayerMouseEvent,
      ): "start" | "finish" | null => {
        const kind = e.features?.[0]?.properties?.kind as
          | MarkerKind
          | undefined;
        return kind === "start" || kind === "finish" ? kind : null;
      };

      map.on("mousemove", LAYER_ENDS, (e: MapLayerMouseEvent) => {
        const kind = endpointKind(e);
        if (!kind) return;
        map.getCanvas().style.cursor = "pointer";
        onHoverRef.current({ kind });
      });

      map.on("mouseleave", LAYER_ENDS, () => {
        map.getCanvas().style.cursor = "";
        onHoverRef.current(null);
      });

      map.on("click", LAYER_ENDS, (e: MapLayerMouseEvent) => {
        const kind = endpointKind(e);
        if (kind) onHoverRef.current({ kind });
      });
    }

    // A rejected build is the case that used to vanish: the dynamic import
    // failing, or the constructor throwing on an option this version of
    // MapLibre does not take. Either way the runner gets a sentence.
    void build().catch((e: unknown) => {
      if (cancelled) return;
      onErrorRef.current(
        e instanceof Error ? e.message : "The map could not be loaded.",
      );
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Built once per mount. The overlay unmounts this component when it closes
    // and when the course changes, so new geometry always arrives as a fresh
    // map rather than as a diff against the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A theme change swaps the basemap in place; the camera belongs to the map
  // rather than to the style, so the runner's pan and zoom survive it. Our
  // layers are re-added by the `style.load` handler above, which re-reads the
  // tokens in their new values.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemapThemeRef.current === theme) return;
    basemapThemeRef.current = theme;
    map.setStyle(BASEMAP_STYLES[theme]);
  }, [theme]);

  // The hill casing toggles visibility rather than being added and removed, so
  // the layer keeps its position in the draw order underneath the route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(LAYER_HILLS)) return;
    map.setLayoutProperty(
      LAYER_HILLS,
      "visibility",
      showHills ? "visible" : "none",
    );
  }, [showHills]);

  // SIZED BY h-full, NEVER BY `absolute inset-0`, and this is not a style
  // preference. MapLibre adds its own `maplibregl-map` class to whatever
  // element it is given, and maplibre-gl.css declares
  // `.maplibregl-map { position: relative }`. That import is UNLAYERED, while
  // Tailwind v4 emits its utilities into `@layer utilities`, and unlayered CSS
  // beats every layer regardless of source order — so `.maplibregl-map` wins
  // over `.absolute`. A container positioned by `inset-0` therefore loses its
  // positioning the instant the map attaches, collapses to height 0, and the
  // map silently never renders: no tiles, no route, no `load` event, no error.
  // Percentage height does not care what `position` ends up as, so the caller
  // owns the box and this fills it.
  return <div ref={containerRef} className="h-full w-full" />;
}
