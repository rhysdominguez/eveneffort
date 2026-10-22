import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The palette's numbers, enforced instead of merely claimed, for BOTH themes.
//
// DESIGN.md states that every stop of the course-profile ramp clears WCAG AA as
// pill text and that the six are distinct and ordered. Those are the two things
// that went wrong before: the ramp first shipped with Mostly Flat and Rolling
// Hills sharing a colour, and findmymarathon's own hexes, the obvious thing to
// copy, fail AA outright (#ff7800 is 2.65:1 on white). Prose does not stop
// either. This does.
//
// The dark theme is the same argument a second time. The light ramp's hexes fail
// against a near-black page (#7F1D1D is nowhere near AA there), so dark carries
// its own six, and the ramp checks below run once per theme. The parity checks
// exist for the quieter failure: a token added to @theme and forgotten in the
// dark block, which does not error, it just leaves one patch of light chrome
// on a dark page.
//
// It reads globals.css off disk, so it needs no browser and no database.

const CSS = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

/**
 * The body of the first `{ ... }` after `header`, braces matched. Comments in
 * globals.css contain no braces, so a plain depth count is enough.
 */
function blockAfter(header: string): string {
  const at = CSS.indexOf(header);
  if (at === -1) throw new Error(`${header} is not in globals.css`);
  const open = CSS.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    if (CSS[i] === "}" && --depth === 0) return CSS.slice(open + 1, i);
  }
  throw new Error(`${header} is never closed`);
}

/** Every `--color-x: #hex;` declaration in a block, keyed by the bare name. */
function colours(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    map.set(m[1], m[2].toUpperCase());
  }
  return map;
}

const THEME_BLOCKS = {
  light: colours(blockAfter("@theme")),
  dark: colours(blockAfter(':root[data-theme="dark"]')),
} as const;
type ThemeName = keyof typeof THEME_BLOCKS;
const THEMES = Object.keys(THEME_BLOCKS) as ThemeName[];

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

const linearise = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map(linearise);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2.1 contrast ratio between two opaque colours. */
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const lab = (hex: string) => {
  const [r, g, b] = channels(hex).map(linearise);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

/** CIELAB hue angle in degrees: how "green" or "red" a colour reads. */
const hueAngle = (hex: string) => {
  const [, a, b] = lab(hex);
  const angle = (Math.atan2(b, a) * 180) / Math.PI;
  return angle < 0 ? angle + 360 : angle;
};

/** HSL saturation as a percentage — how vivid a colour is, independent of hue. */
const saturation = (hex: string) => {
  const [r, g, b] = channels(hex);
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  const l = (max + min) / 2;
  if (max === min) return 0;
  return ((max - min) / (1 - Math.abs(2 * l - 1))) * 100;
};

/** CIE76 colour difference. Coarser than ΔE00, but enough to catch a collapse. */
const deltaE = (a: string, b: string) => {
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

// Fastest → hardest, the order `TERRAIN_ORDER` and `PROFILE_COLOR` both use.
const RAMP = [
  "green-primary", // Downhill
  "lime-primary", //  Very Flat
  "gold-primary", //  Mostly Flat
  "orange-primary", // Rolling Hills
  "red-primary", //   Hilly
  "red-deep", //      Very Hilly
] as const;

const WHITE = "#FFFFFF";

describe.each(THEMES)("course-profile colour ramp (%s theme)", (theme) => {
  const t = (name: string) => {
    const value = THEME_BLOCKS[theme].get(name);
    if (!value) throw new Error(`--color-${name} is not defined in ${theme}`);
    return value;
  };

  it("defines all six stops", () => {
    for (const name of RAMP) expect(t(name)).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("gives no two profiles the same colour", () => {
    expect(new Set(RAMP.map(t)).size).toBe(RAMP.length);
  });

  it("keeps neighbouring stops visibly apart", () => {
    // Distinct hex is a low bar: #68CF9A and #68CF9B are distinct. The smallest
    // gap in the light ramp is 16.4 (Rolling Hills to Hilly); the dark ramp's is
    // 16.2, at both of its last two steps. 15 fails a collapse and passes both.
    for (let i = 1; i < RAMP.length; i++) {
      expect(deltaE(t(RAMP[i - 1]), t(RAMP[i]))).toBeGreaterThanOrEqual(15);
    }
  });

  it("clears WCAG AA as pill text on the page and on the elevated surface", () => {
    // 4.5:1 is the AA floor for text under 18pt; the pill is 12px.
    for (const name of RAMP) {
      expect(contrast(t(name), t("bg-page"))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t(name), t("bg-surface"))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t(name), t("bg-elevated"))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sweeps hue monotonically from green to red", () => {
    // This is what makes it a ramp rather than six unrelated accents: hue falls
    // at every step (light 147° → 32°, dark 158° → 25°). A new stop that breaks
    // the order would still pass every test above.
    const hues = RAMP.map((name) => hueAngle(t(name)));
    for (let i = 1; i < hues.length; i++) {
      expect(hues[i]).toBeLessThan(hues[i - 1]);
    }
  });

  it("makes Very Hilly the darker of the two reds", () => {
    // Hilly and Very Hilly are a few degrees of hue apart, so lightness is what
    // separates them. On white that reads as more contrast (10:1 against 6.5:1);
    // on the dark page the same ordering reads as less (6.0:1 against 6.9:1),
    // because the darker red is the one nearer the page. Luminance says it
    // without caring which way the page runs.
    expect(luminance(t("red-deep"))).toBeLessThan(luminance(t("red-primary")));
  });
});

describe.each(THEMES)("text and surfaces (%s theme)", (theme) => {
  const t = (name: string) => THEME_BLOCKS[theme].get(name)!;

  it("reads primary and secondary text at AA on every surface", () => {
    for (const surface of ["bg-page", "bg-surface", "bg-elevated"]) {
      expect(contrast(t("text-primary"), t(surface))).toBeGreaterThanOrEqual(7);
      expect(contrast(t("text-secondary"), t(surface))).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("keeps white type at AA on both red fills, in either theme", () => {
    // The fill pair is the reason the text red and the button red are separate
    // tokens: no single red can be light enough for text on near-black and dark
    // enough to carry white type. Nothing may theme these two away from that.
    expect(contrast(WHITE, t("red-fill"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(WHITE, t("red-fill-hover"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the footer's own type readable on the footer's own fill", () => {
    for (const fill of ["bg-footer", "bg-footer-deep"]) {
      expect(contrast(t("text-on-dark"), t(fill))).toBeGreaterThanOrEqual(7);
      expect(
        contrast(t("text-on-dark-muted"), t(fill)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("draws the scrim dark", () => {
    // Its reason for existing: text-primary at 40% is black in light and WHITE
    // in dark, and a white veil over a dark page is a flashbang.
    expect(luminance(t("scrim"))).toBeLessThan(0.02);
  });
});

describe("dark mode specifically", () => {
  // Assertions that only the dark theme can meet today. Light's tertiary grey is
  // #A3A3A3 on white, which is 2.5:1 and under AA — a pre-existing decision about
  // eyebrow labels, not something this theme should inherit into a second place.
  it("reads tertiary text at AA on every dark surface", () => {
    // It did not at first: #737373 on the elevated surface was 3.8:1, and that is
    // the token the column headers and axis labels use.
    const { dark } = THEME_BLOCKS;
    for (const surface of ["bg-page", "bg-surface", "bg-elevated"]) {
      expect(
        contrast(dark.get("text-tertiary")!, dark.get(surface)!),
        surface,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("builds depth from a surface ladder, not from one flat black", () => {
    // The failure this locks out is the one the first pass shipped: page and
    // surface identical, so a card never lifted and only a 1.3:1 border said
    // where it ended. Each step must be genuinely lighter than the last.
    const { dark } = THEME_BLOCKS;
    const ladder = ["bg-page", "bg-surface", "bg-elevated"].map(
      (n) => luminance(dark.get(n)!),
    );
    expect(ladder[1]).toBeGreaterThan(ladder[0]);
    expect(ladder[2]).toBeGreaterThan(ladder[1]);
  });

  it("keeps the page off pure black and the body text off pure white", () => {
    // Both ends of the scale. Pure black leaves no room below for elevation, and
    // near-white on it is the ~19:1 glare that reads as harsh.
    const { dark } = THEME_BLOCKS;
    expect(luminance(dark.get("bg-page")!)).toBeGreaterThan(luminance("#000000"));
    expect(contrast(dark.get("text-primary")!, dark.get("bg-page")!)).toBeLessThan(17);
    // Still comfortably above AAA for body text; this is a ceiling, not a floor.
    expect(
      contrast(dark.get("text-primary")!, dark.get("bg-page")!),
    ).toBeGreaterThanOrEqual(7);
  });

  it("desaturates the profile ramp for a dark field", () => {
    // A fully saturated accent vibrates against a dark field, so the dark ramp is
    // held under a saturation ceiling. This is deliberately an absolute ceiling
    // rather than "less saturated than the matching light stop": the light ramp's
    // dark end is low-saturation only because it is dark (maroon #7F1D1D is 62%),
    // so a pairwise comparison would demand the dark stop be under that while
    // also being light enough to read, which is not satisfiable.
    //
    // The guard that matters is against the obvious wrong move, which is what
    // this theme shipped first: the vivid off-the-shelf brights (#A3E635 at 78%,
    // #EAB308 at 93%, #FB923C at 96%). Those all fail here. The current ramp runs
    // 52% to 71%.
    for (const name of RAMP) {
      expect(saturation(THEME_BLOCKS.dark.get(name)!), name).toBeLessThanOrEqual(
        75,
      );
    }
  });
})

describe("the footer stays a band in dark mode", () => {
  it("is lighter than everything it can sit under, not just the page", () => {
    // Twice now this has been set by checking it against the page alone and
    // shipping a footer that vanished into whatever was actually above it. On
    // most pages the footer meets the page; on the home page it meets the
    // closing CTA, which is an elevated band. It has to clear both.
    const { dark } = THEME_BLOCKS;
    const footer = dark.get("bg-footer")!;
    for (const neighbour of ["bg-page", "bg-elevated"]) {
      expect(luminance(footer), neighbour).toBeGreaterThan(
        luminance(dark.get(neighbour)!),
      );
      expect(contrast(footer, dark.get(neighbour)!), neighbour).toBeGreaterThanOrEqual(
        1.2,
      );
    }
  });

  it("keeps its own dividers visible against its own fill", () => {
    // border-on-dark has to move with the footer. At #3D3D3D on a #383838 fill
    // the column rules were 1.07:1, which is not a rule, it is nothing.
    const { dark } = THEME_BLOCKS;
    expect(
      contrast(dark.get("border-on-dark")!, dark.get("bg-footer")!),
    ).toBeGreaterThanOrEqual(1.3);
  });

  it("keeps the lower tier darker than the upper one, as in light", () => {
    for (const theme of THEMES) {
      const t = THEME_BLOCKS[theme];
      expect(luminance(t.get("bg-footer-deep")!), theme).toBeLessThan(
        luminance(t.get("bg-footer")!),
      );
    }
  });
});

/**
 * The calendar's forecast marker (ROADMAP #19), which has to survive being
 * pushed from both sides.
 *
 * It shipped three times. A 3px --color-green-primary rule was invisible in a
 * grid of pale chips. A saturated #DCFCE7 fill with a green outline was too
 * loud on a page of pure neutrals and read as an alert. The tint here is the
 * settled middle, and these assertions are the fence on either side of it: an
 * upper bound on how vivid it may be, and a lower bound on how faint. Prose
 * would not have caught either failure, which is the same reason the ramp's
 * numbers are checked rather than claimed.
 */
describe.each(THEMES)("calendar forecast marker (%s theme)", (theme) => {
  const c = THEME_BLOCKS[theme];
  const fill = () => c.get("green-fill")!;

  it("defines a fill distinct from the green text mark", () => {
    expect(c.has("green-fill")).toBe(true);
    expect(c.has("green-primary")).toBe(true);
    // Two ROLES, not two names for one colour — as with the two reds.
    expect(fill()).not.toBe(c.get("green-primary"));
  });

  it("carries the race name at AA", () => {
    expect(contrast(c.get("text-primary")!, fill())).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.get("text-secondary")!, fill())).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The lower bound. A marked chip replaces an --color-bg-elevated one, and if
   * the two were the same weight the mark would vanish — the exact bug the
   * fill was introduced to fix.
   *
   * The threshold was 10 when the fill was #DCFCE7 at 84% saturation. Softening
   * the tint necessarily moved it, so the number is restated on its own terms
   * rather than left where the old colour happened to put it: 5 is roughly
   * twice the CIE76 just-noticeable difference for adjacent large areas, which
   * is the floor for something a reader must FIND rather than merely tell apart
   * once pointed at it. Light measures ~7.6, dark ~12.8.
   */
  it("is visibly apart from the surface it replaces", () => {
    expect(deltaE(fill(), c.get("bg-elevated")!)).toBeGreaterThan(5);
  });

  /**
   * The upper bound, and the reason this block was rewritten. On a site whose
   * palette is red, white, black and grayscale, a tint at 84% saturation is not
   * an annotation, it is the loudest thing on the page. The cap keeps the mark
   * quieter than --color-green-primary, the data-mark green it belongs to, so
   * no future "make it pop" edit can walk it back without this failing.
   */
  it("stays quieter than the data-mark green it annotates with", () => {
    expect(saturation(fill())).toBeLessThan(saturation(c.get("green-primary")!));
    expect(saturation(fill())).toBeLessThan(50);
  });
});

/**
 * The fill must not simply be the light tint reused. #DCFCE7 on a near-black
 * page is a lamp: the marked chip would outshine every race name around it and
 * the annotation would become the loudest thing on the calendar.
 */
describe("the forecast marker adapts to dark rather than carrying over", () => {
  const light = THEME_BLOCKS.light.get("green-fill")!;
  const dark = THEME_BLOCKS.dark.get("green-fill")!;

  it("uses a different value in each theme", () => {
    expect(dark).not.toBe(light);
  });

  it("is dark-on-dark, not a light patch on a dark page", () => {
    const page = THEME_BLOCKS.dark.get("bg-page")!;
    expect(luminance(dark)).toBeLessThan(luminance(light));
    // Above the page, so the chip still reads as raised — but nowhere near the
    // 4.5:1 that would make it a block of light.
    expect(contrast(dark, page)).toBeGreaterThan(1.1);
    expect(contrast(dark, page)).toBeLessThan(2);
  });

  // Dark desaturates further than light, for the reason the profile ramp does:
  // a vivid accent on a dark field vibrates.
  it("is the more desaturated of the two", () => {
    expect(saturation(dark)).toBeLessThan(saturation(light));
  });
});

describe("theme parity", () => {
  it("defines every light token in the dark block", () => {
    // The failure this catches is silent: a token added to @theme and never
    // given a dark value inherits its light one, and the page ships with one
    // patch of white chrome on a black background. Values that are deliberately
    // the same in both themes (red-fill, the footer's on-dark text) are still
    // restated, so "forgot" and "meant to" can be told apart.
    const missing = [...THEME_BLOCKS.light.keys()].filter(
      (name) => !THEME_BLOCKS.dark.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("defines nothing in the dark block that light does not", () => {
    // A typo in a dark token name defines a variable nothing reads, and the
    // real token silently keeps its light value.
    const extra = [...THEME_BLOCKS.dark.keys()].filter(
      (name) => !THEME_BLOCKS.light.has(name),
    );
    expect(extra).toEqual([]);
  });

  it("keeps the two red fills identical across themes", () => {
    for (const name of ["red-fill", "red-fill-hover"]) {
      expect(THEME_BLOCKS.dark.get(name)).toBe(THEME_BLOCKS.light.get(name));
    }
  });
});

describe("print", () => {
  it("never sees the dark theme, so a dark-mode paceband still prints light", () => {
    // The dark block is wrapped in `@media not print`, which is what makes the
    // printed band light without restating a single light value for paper.
    const at = CSS.indexOf(':root[data-theme="dark"]');
    const before = CSS.slice(0, at);
    expect(before.lastIndexOf("@media not print")).toBeGreaterThan(
      before.lastIndexOf("}\n\n"),
    );
  });

  it("restates the paceband preview's paper colours exactly as light has them", () => {
    // The screen preview stands for a sheet of white paper, so it re-declares
    // the tokens the strip reads. Restated hexes drift; this is the leash.
    const preview = colours(blockAfter(".paceband-preview {"));
    expect(preview.size).toBeGreaterThan(0);
    for (const [name, value] of preview) {
      expect(THEME_BLOCKS.light.get(name), `--color-${name}`).toBe(value);
    }
  });
});

describe("theme mechanism", () => {
  it("is opt-in: nothing keys off the system preference", () => {
    // The page is white by design, and a visitor who never touched the toggle
    // has asked for nothing. `prefers-color-scheme` appearing here would be the
    // site changing colour for people who did not choose it.
    // Comments are stripped first: the dark block's own header explains, in so
    // many words, that nothing here keys off it.
    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toContain("prefers-color-scheme");
  });

  it("switches native controls with the theme", () => {
    expect(CSS).toMatch(/html\s*\{[^}]*color-scheme:\s*light/);
    expect(blockAfter(':root[data-theme="dark"]')).toContain(
      "color-scheme: dark",
    );
  });
});
