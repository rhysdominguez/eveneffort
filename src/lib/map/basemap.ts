import type { Map as MapLibreMap } from "maplibre-gl";
import type { Theme } from "@/lib/theme";

// Shared MapLibre plumbing: the basemap styles, the worker location, and the
// two helpers a map needs before it can draw anything in this design system.
//
// All of this began inside src/components/home/CourseMap.tsx and moved here
// when the interactive course map (ROADMAP #22) became the second map on the
// site. The reasoning in each comment is that component's, preserved rather
// than rewritten: these are the conclusions of a debugging session each, and
// re-deriving them is the expensive way to find out.

/**
 * OpenFreeMap's "positron" style — a near-white basemap with grey roads and no
 * saturated colour of its own, which is the only reason a map can live on this
 * site at all: it leaves red free to mean "race", the way red means something
 * everywhere else here. Free, keyless and OpenStreetMap-derived.
 *
 * Dark mode takes its sibling "dark" for the same reason: near-black, grey
 * roads, no colour of its own (its background is rgb(12,12,12) against our
 * #0A0A0A page). Not "dark-matter", which is the CARTO name and 404s here.
 *
 * If it ever needs to become a paid, SLA-backed provider (MapTiler et al.),
 * this constant plus an env var is the whole change — nothing below knows
 * where its tiles come from.
 */
export const BASEMAP_STYLES: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

/** Written by `scripts/sync-maplibre-worker.mjs`. See its header for why. */
export const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

/**
 * MapLibre paints on a WebGL canvas, so its colours must be literal values —
 * `var(--color-red-primary)` means nothing to a shader. Reading the tokens off
 * the document at runtime keeps globals.css the single source of truth
 * (DESIGN.md rule 5) instead of re-declaring the palette in JS.
 */
export function readToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * A font stack the basemap can actually render label text in.
 *
 * `text-font` names glyph sets served by the style, not CSS families — asking
 * for Montserrat (or MapLibre's default "Open Sans Regular") would silently
 * render nothing if the provider doesn't host it. Rather than hardcode a guess
 * about OpenFreeMap's glyphs, borrow a stack the style already uses for its
 * own labels, so this keeps working if the basemap is ever swapped.
 *
 * Bold is preferred, then anything non-italic: positron's first symbol layer
 * happens to be italic (water labels), and a distance marker set in italic
 * reads as a typo.
 */
export function styleFontStack(map: MapLibreMap): string[] | undefined {
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
