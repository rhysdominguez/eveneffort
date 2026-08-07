"use client";
import { useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  MapLayerMouseEvent,
  Map as MapLibreMap,
  Marker,
} from "maplibre-gl";
import type { CourseSummary } from "@/types";
import {
  boundsOf,
  coursesToGeoJSON,
  nearestCourse,
  POPUP_COURSE_ATTR,
  popupMarkup,
  type CoursePinProperties,
} from "./courseMapData";

/**
 * OpenFreeMap's "positron" style — a near-white basemap with grey roads and no
 * saturated colour of its own, which is the only reason a map can live on this
 * site at all: it leaves red free to mean "race", the way red means something
 * everywhere else here. Free, keyless and OpenStreetMap-derived.
 *
 * If it ever needs to become a paid, SLA-backed provider (MapTiler et al.),
 * this constant plus an env var is the whole change — nothing below knows
 * where its tiles come from.
 */
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

/** Written by `scripts/sync-maplibre-worker.mjs`. See its header for why. */
const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

const SOURCE_ID = "courses";
const CLUSTER_LAYER = "course-clusters";
const CLUSTER_COUNT_LAYER = "course-cluster-count";
const PIN_LAYER = "course-pins";

/**
 * MapLibre paints on a WebGL canvas, so its colours must be literal values —
 * `var(--color-red-primary)` means nothing to a shader. Reading the tokens off
 * the document at runtime keeps globals.css the single source of truth
 * (DESIGN.md rule 5) instead of re-declaring the palette in JS.
 */
function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * A font stack the basemap can actually render the cluster count in.
 *
 * `text-font` names glyph sets served by the style, not CSS families — asking
 * for Montserrat (or MapLibre's default "Open Sans Regular") would silently
 * render nothing if the provider doesn't host it. Rather than hardcode a guess
 * about OpenFreeMap's glyphs, borrow a stack the style already uses for its
 * own labels, so this keeps working if the basemap is ever swapped.
 *
 * Bold is preferred, then anything non-italic: positron's first symbol layer
 * happens to be italic (water labels), and a cluster count set in italic reads
 * as a typo.
 */
function styleFontStack(map: MapLibreMap): string[] | undefined {
  const stacks: string[][] = [];
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== "symbol") continue;
    const font = layer.layout?.["text-font"];
    if (Array.isArray(font) && font.every((f) => typeof f === "string")) {
      stacks.push(font as string[]);
    }
  }
  const named = (needle: string) =>
    stacks.find((s) => s.some((f) => f.includes(needle)));
  return (
    named("Bold") ??
    stacks.find((s) => !s.some((f) => f.includes("Italic"))) ??
    stacks[0]
  );
}

interface Props {
  catalog: CourseSummary[];
  /** Called with a course slug when a pin's CTA is pressed. */
  onSelectCourse: (courseId: string) => void;
}

/**
 * The race map. A thin imperative wrapper around MapLibre: all the decisions
 * worth testing live in `courseMapData.ts`, because jsdom has no WebGL context
 * and constructing a map here would throw in any unit test.
 *
 * Two deliberate load behaviours:
 *
 * - `maplibre-gl` is imported inside the effect, never at module scope. It
 *   touches `window` on import, and it is ~200 KB that the hero — the thing
 *   people actually came for — should not wait behind.
 * - The map is not built until the band scrolls into view. It sits below the
 *   fold, so on a visit that never reaches it, no tiles are ever fetched.
 */
export function CourseMap({ catalog, onSelectCourse }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const youAreHereRef = useRef<Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  // The latest callback, read at click time. Keeps the effect's dependency
  // list to `catalog` alone, so a parent re-render can't tear down and rebuild
  // the map (which would drop the user's pan and zoom mid-browse).
  const onSelectRef = useRef(onSelectCourse);
  useEffect(() => {
    onSelectRef.current = onSelectCourse;
  }, [onSelectCourse]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let cleanupDelegate: (() => void) | null = null;

    async function build() {
      // Namespace import, not default: maplibre-gl v6 dropped its default
      // export.
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container) return;

      // MapLibre parses vector tiles in a web worker, and locates that worker
      // by resolving "./maplibre-gl-worker.mjs" against its own
      // `import.meta.url` — which, once the library is a bundler chunk, points
      // at /_next/static/chunks/, where no such file exists. The map then
      // fails in the most confusing way available: canvas, zoom buttons and
      // attribution all render, tiles silently never load, no error surfaces.
      // `scripts/sync-maplibre-worker.mjs` copies the worker here at predev /
      // prebuild; this points MapLibre at that copy.
      maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);

      const red = readToken("--color-red-primary", "#B91C1C");
      const surface = readToken("--color-bg-surface", "#FFFFFF");

      const map = new maplibregl.Map({
        container,
        style: BASEMAP_STYLE,
        // Zoomed out over the Atlantic until `fitBounds` lands. Without a
        // center the map opens at null island and visibly jumps.
        center: [0, 25],
        zoom: 1,
        // A map mid-page must not swallow the scroll wheel. Ctrl/⌘-scroll and
        // two-finger drag still zoom; a plain scroll passes to the page.
        cooperativeGestures: true,
      });
      mapRef.current = map;

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      const bounds = boundsOf(catalog);
      if (bounds) {
        map.fitBounds(bounds, { padding: 64, duration: 0, maxZoom: 5 });
      }

      map.on("load", () => {
        if (cancelled) return;

        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: coursesToGeoJSON(catalog),
          cluster: true,
          clusterRadius: 40,
          // Past this zoom, races in the same metro separate into their own
          // pins rather than hiding behind a count.
          clusterMaxZoom: 9,
        });

        map.addLayer({
          id: CLUSTER_LAYER,
          type: "circle",
          source: SOURCE_ID,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": red,
            "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 15, 26],
            "circle-stroke-width": 2,
            "circle-stroke-color": surface,
          },
        });

        const fontStack = styleFontStack(map);
        map.addLayer({
          id: CLUSTER_COUNT_LAYER,
          type: "symbol",
          source: SOURCE_ID,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            ...(fontStack ? { "text-font": fontStack } : {}),
            "text-size": 12,
          },
          paint: { "text-color": surface },
        });

        map.addLayer({
          id: PIN_LAYER,
          type: "circle",
          source: SOURCE_ID,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": red,
            "circle-radius": 8,
            "circle-stroke-width": 2,
            "circle-stroke-color": surface,
          },
        });

        // Zoom into a cluster rather than trying to popup seven races at once.
        map.on("click", CLUSTER_LAYER, async (e: MapLayerMouseEvent) => {
          const feature = e.features?.[0];
          const clusterId = feature?.properties?.cluster_id;
          if (clusterId === undefined) return;
          const source = map.getSource(SOURCE_ID) as GeoJSONSource;
          const zoom = await source.getClusterExpansionZoom(clusterId);
          if (cancelled) return;
          map.easeTo({
            center: (feature!.geometry as GeoJSON.Point).coordinates as [
              number,
              number,
            ],
            zoom,
          });
        });

        map.on("click", PIN_LAYER, (e: MapLayerMouseEvent) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const props = feature.properties as unknown as CoursePinProperties;
          const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
          new maplibregl.Popup({ offset: 14, maxWidth: "17rem" })
            .setLngLat([lng, lat])
            .setHTML(popupMarkup(props))
            .addTo(map);
        });

        for (const layer of [CLUSTER_LAYER, PIN_LAYER]) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      });

      // The popup's CTA is markup MapLibre injected, so it has no React
      // handler. One delegated listener on the container covers every popup
      // that will ever open, and dies with the effect.
      const onContainerClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        const cta = target?.closest?.(`[${POPUP_COURSE_ATTR}]`);
        const courseId = cta?.getAttribute(POPUP_COURSE_ATTR);
        if (courseId) onSelectRef.current(courseId);
      };
      container.addEventListener("click", onContainerClick);
      cleanupDelegate = () =>
        container.removeEventListener("click", onContainerClick);
    }

    // Build on first approach, not on mount — the band is below the fold.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void build();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
      cleanupDelegate?.();
      youAreHereRef.current?.remove();
      youAreHereRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [catalog]);

  /**
   * "Near me" — geolocation is requested here and nowhere else. Nothing
   * prompts on page load: a marketing page that fires a permission dialog at a
   * first-time visitor has asked for something before it has earned it.
   */
  async function locate() {
    const map = mapRef.current;
    if (!map) return;
    if (!("geolocation" in navigator)) {
      setLocationNote("This browser can't share a location.");
      return;
    }
    setLocating(true);
    setLocationNote(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        // Already resolved from the build above — this is the module cache,
        // not a second download.
        const maplibregl = await import("maplibre-gl");
        if (!mapRef.current) return;

        youAreHereRef.current?.remove();
        youAreHereRef.current = new maplibregl.Marker({
          color: readToken("--color-text-primary", "#0A0A0A"),
        })
          .setLngLat([longitude, latitude])
          .addTo(mapRef.current);

        mapRef.current.flyTo({ center: [longitude, latitude], zoom: 6 });

        const nearest = nearestCourse(catalog, latitude, longitude);
        setLocationNote(
          nearest
            ? `Closest race: ${nearest.course.displayName}, about ${Math.round(nearest.distanceKm).toLocaleString()} km away.`
            : "Found you — no races plotted yet.",
        );
        setLocating(false);
      },
      () => {
        setLocationNote("Couldn't get your location. Pan the map instead.");
        setLocating(false);
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className="space-y-3">
      {/* The frame lives here, not on the caller, so the "Near me" result line
          below stays outside the border rather than showing as an empty white
          strip inside it. */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]">
        <div
          ref={containerRef}
          role="region"
          aria-label="Map of marathons you can build a paceband for"
          className="h-96 w-full lg:h-[28rem]"
        />
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="absolute left-3 top-3 z-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] disabled:text-[var(--color-text-tertiary)]"
        >
          {locating ? "Locating…" : "Near me"}
        </button>
      </div>
      {/* aria-live so the result of pressing "Near me" is announced, not just
          drawn on a canvas nobody can read. */}
      <p
        aria-live="polite"
        className="min-h-[1.25rem] text-sm text-[var(--color-text-secondary)]"
      >
        {locationNote}
      </p>
    </div>
  );
}
