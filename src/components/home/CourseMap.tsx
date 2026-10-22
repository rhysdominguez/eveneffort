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
import { readState, writeState } from "@/lib/clientState";
import { HOME_MAP_CAMERA } from "@/lib/stateKeys";
import { useTheme } from "@/hooks/useTheme";
import { readAppliedTheme, type Theme } from "@/lib/theme";
import {
  BASEMAP_STYLES,
  MAPLIBRE_WORKER_URL,
  readToken,
  styleFontStack,
} from "@/lib/map/basemap";

// The basemap styles, the worker URL and the two helpers below it moved to
// src/lib/map/basemap.ts when the interactive course map (ROADMAP #22) became
// the second map on the site. Their reasoning went with them.

const SOURCE_ID = "courses";
const CLUSTER_LAYER = "course-clusters";
const CLUSTER_COUNT_LAYER = "course-cluster-count";
const PIN_LAYER = "course-pins";

/**
 * The "you are here" marker: text-primary, so it reads against either basemap
 * and never competes with the red race pins. Read at creation, so a theme change
 * has to redraw it (see the theme effect in `CourseMap`).
 */
function markerAt(
  maplibregl: typeof import("maplibre-gl"),
  map: MapLibreMap,
  at: { lng: number; lat: number },
): Marker {
  return new maplibregl.Marker({
    color: readToken("--color-text-primary", "#0A0A0A"),
  })
    .setLngLat([at.lng, at.lat])
    .addTo(map);
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
  // Which basemap the map is currently showing, so the theme effect below can
  // tell "the theme changed" from "the effect ran". Set by the build.
  const basemapThemeRef = useRef<Theme | null>(null);
  const [theme] = useTheme();
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

      // The theme as the document has it NOW, not the hook's value captured
      // when this effect was set up: the build is async and starts on scroll,
      // so the two can differ.
      const initialTheme = readAppliedTheme();
      basemapThemeRef.current = initialTheme;

      const map = new maplibregl.Map({
        container,
        style: BASEMAP_STYLES[initialTheme],
        // Zoomed out over the Atlantic until `fitBounds` lands. Without a
        // center the map opens at null island and visibly jumps.
        center: [0, 25],
        zoom: 1,
        // A map mid-page must not swallow the scroll wheel. Ctrl/⌘-scroll and
        // two-finger drag still zoom; a plain scroll passes to the page.
        cooperativeGestures: true,
        // MapLibre's default AttributionControl only collapses to an icon
        // below 640px wide; at full desktop width it spells out all four
        // credits (MapLibre, OpenFreeMap, OpenMapTiles, OpenStreetMap) inline.
        // The credits are required by OSM's ODbL and OpenFreeMap's terms — they
        // can't be dropped — but collapsing to the same "ⓘ" icon at every width
        // keeps them one click away instead of permanently cluttering the corner.
        attributionControl: { compact: true },
      });
      mapRef.current = map;

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      // Where the runner left the map last time wins over the default fit.
      // Validated in stateKeys.ts rather than trusted: MapLibre throws on a
      // non-finite center or an out-of-range latitude, and a throw HERE — inside
      // the build, before any layer is added — leaves an empty grey box where
      // the band should be.
      const camera = readState(HOME_MAP_CAMERA);
      if (camera) {
        map.jumpTo(camera);
      } else {
        const bounds = boundsOf(catalog);
        if (bounds) {
          map.fitBounds(bounds, { padding: 64, duration: 0, maxZoom: 5 });
        }
      }

      // Attached after the opening camera is set, so the default fit isn't
      // recorded as though the runner had chosen it. `moveend` covers pan,
      // zoom, the cluster-click easeTo and "Near me" alike — every way the
      // camera can end up somewhere deliberate.
      map.on("moveend", () => {
        if (cancelled) return;
        // `.wrap()` because panning east past the dateline keeps counting up —
        // getCenter() happily returns lng 200, which the validator would then
        // reject on the way back in, silently losing the camera.
        const center = map.getCenter().wrap();
        writeState(HOME_MAP_CAMERA, {
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: map.getPitch(),
        });
      });

      // Our source and layers live in the STYLE, and `setStyle` (a theme change)
      // discards the whole thing, so they are added on every `style.load`, the
      // first one included, rather than once on `load`. The colours are read
      // here for the same reason: they are the theme's, and this runs again
      // after the theme has changed. The click and hover handlers below are
      // keyed by layer id and live on the map, so they survive a style swap and
      // are registered once.
      map.on("style.load", () => {
        if (cancelled || map.getSource(SOURCE_ID)) return;

        const red = readToken("--color-red-primary", "#B91C1C");
        const surface = readToken("--color-bg-surface", "#FFFFFF");

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
      });

      map.on("load", () => {
        if (cancelled) return;

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

  // A theme change swaps the basemap in place. The camera, any open popup and
  // the clustered source's own state all belong to the map rather than the
  // style, so none of them is lost the way they would be by tearing the map
  // down and rebuilding it. Our layers are re-added by the `style.load`
  // handler above. Before the build has run (the band is below the fold and
  // builds lazily) there is nothing to swap, and the build reads the theme
  // itself.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemapThemeRef.current === theme) return;
    basemapThemeRef.current = theme;
    map.setStyle(BASEMAP_STYLES[theme]);

    // The "you are here" marker is filled with the theme's text colour, which
    // is now the opposite of what it was drawn in: near-black on the dark map,
    // or near-white on the light one. Redraw it in place.
    const marker = youAreHereRef.current;
    if (marker) {
      const at = marker.getLngLat();
      void import("maplibre-gl").then((maplibregl) => {
        if (mapRef.current !== map) return;
        marker.remove();
        youAreHereRef.current = markerAt(maplibregl, map, at);
      });
    }
  }, [theme]);

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
        youAreHereRef.current = markerAt(maplibregl, mapRef.current, {
          lng: longitude,
          lat: latitude,
        });

        mapRef.current.flyTo({ center: [longitude, latitude], zoom: 6 });

        const nearest = nearestCourse(catalog, latitude, longitude);
        setLocationNote(
          nearest
            ? `Closest race: ${nearest.course.displayName}, about ${Math.round(nearest.distanceKm).toLocaleString()} km away.`
            : "Found you, but no races are plotted yet.",
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
