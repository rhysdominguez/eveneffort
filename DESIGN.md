# eveneffort — Design System

A unified, disciplined visual language for the app. Red, white, black — plus one
six-stop ramp, on one pill, argued for at the bottom of this file. Nothing else.

## Principles

1. **Surface-dominant.** The page is white. The surface dominates and whitespace is the primary tool. Color is rare and meaningful. The app is light mode only — there is no dark mode and no in-app toggle.
2. **Red is reserved.** Red appears only on interactive primary actions (Calculate button, active toggle), and as a meaningful data signal (uphill elevation deltas, the two hilliest course profiles). It should not be used for decoration. The course-profile pill is the one place the palette runs a multi-hue scale, and it is a closed set — see "What NOT to do".
3. **Type carries the brand.** Montserrat carries the whole site — headings and body. The original Fraunces serif is kept only for the "eveneffort" wordmark. Tabular numerals everywhere numeric data appears.
4. **Borders over shadows.** Hierarchy is built with 1px borders and generous radius, not drop shadows.
5. **One source of truth.** All colors, fonts, and radii live in `src/app/globals.css` as design tokens. No hardcoded values in components.

## Color tokens

Defined in the `@theme` block of `src/app/globals.css`. Reference in components as `[var(--token)]` Tailwind arbitrary values — never as `zinc-*`/`gray-*`/`red-*` named utilities.

| Token | Value | Usage |
|---|---|---|
| `--color-red-primary` | `#B91C1C` | Primary action backgrounds, active toggle, uphill elevation delta, the Hilly course profile |
| `--color-red-deep` | `#7F1D1D` | Primary action hover state, and the Very Hilly course profile — the dark end of the profile ramp |
| `--color-green-primary` | `#15803D` | Faster-than-goal weather delta, and the Downhill course profile — as reserved as red; never decoration |
| `--color-lime-primary` | `#4D7C0F` | The Very Flat course profile — profile ramp only |
| `--color-gold-primary` | `#A16207` | The Mostly Flat course profile — profile ramp only |
| `--color-orange-primary` | `#C2410C` | The Rolling Hills course profile — profile ramp only |
| `--color-bg-page` | `#FFFFFF` | Page background (set on `html`) |
| `--color-bg-surface` | `#FFFFFF` | Card / surface background |
| `--color-bg-elevated` | `#FAFAFA` | Table header, hover fill, chart area fill, alternating marketing band |
| `--color-bg-footer` | `#262626` | Site footer, upper tier — **footer only** |
| `--color-bg-footer-deep` | `#171717` | Site footer, lower tier — **footer only** |
| `--color-text-on-dark` | `#FAFAFA` | Wordmark and column headings on the footer — **footer only** |
| `--color-text-on-dark-muted` | `#B5B5B5` | Footer links, tagline, copyright — **footer only** |
| `--color-border-on-dark` | `#404040` | Footer column dividers — **footer only** |
| `--color-text-primary` | `#0A0A0A` | Headings, primary values, chart line |
| `--color-text-secondary` | `#525252` | Body, helper text, downhill delta, row labels |
| `--color-text-tertiary` | `#A3A3A3` | Eyebrows/column headers, zero delta, axis labels |
| `--color-border` | `#E5E5E5` | All 1px borders, gridlines, disabled button bg |
| `--color-border-focus` | `#0A0A0A` | Input focus border |

## Theme

Light mode only. There is no dark mode: no `@media (prefers-color-scheme: dark)` block, no `dark:` variants, no component-level theme logic. `color-scheme: light` is set on `html` so native controls, spinners, and scrollbars stay light.

**The footer is the one dark surface, and it is not an exception to the above.** A near-black band at the foot of a white page is a layout decision, not a theme: it renders identically for every visitor and responds to no system preference. Its `*-on-dark` / `*-footer*` tokens exist because inverted text needs its own ramp, and they are scoped to `SiteFooter` — do not reach for them anywhere else, and do not generalise them into a theme.

Rule for new components: never hardcode a surface (`bg-white`) or text color — always go through a token, so the single source of truth in `globals.css` stays authoritative.

## Typography

Montserrat drives the entire site — body and headings — via
`--font-sans` and `--font-display`. The original Fraunces serif is
retained **only** for the "eveneffort" wordmark, exposed as
`--font-wordmark`. Do **not** introduce sizes outside this scale.

| Role | Tailwind | Family |
|---|---|---|
| Wordmark (eveneffort logo) | `font-wordmark text-[2rem] tracking-tight` | Fraunces 500 |
| Display heading | `text-2xl/3xl font-display tracking-tight` | Montserrat 600 |
| Section heading | `text-lg font-semibold` | Montserrat 600 |
| Pace / split values | `text-base font-tabular font-medium` | Montserrat 500, tabular |
| Body | `text-base` | Montserrat 400 |
| Helper / label | `text-sm text-[var(--color-text-secondary)]` | Montserrat 400 |
| Column header / eyebrow | `text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] font-medium` | Montserrat 500 |

`.font-tabular`, `.font-display`, and `.font-wordmark` are utility
classes defined in `globals.css`.

## Spacing & radius

- Card radius: `rounded-2xl` (16px)
- Control radius: `rounded-lg` (8px) — buttons, inputs, toggles
- Card padding: `p-8` desktop, `p-6` mobile
- Section spacing: `space-y-10` between major sections in a page

## Component patterns

- **Card:** `rounded-2xl border border-[var(--color-border)] bg-white p-8 space-y-8`. No shadow.
- **Primary button:** `w-full rounded-lg bg-[var(--color-red-primary)] hover:bg-[var(--color-red-deep)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-tertiary)] text-white py-4 text-base font-semibold transition-colors`.
- **Secondary toggle (pill group):** container `inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden`; active button `bg-[var(--color-red-primary)] text-white`, inactive `bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]`; each `px-6 py-2.5 text-sm font-medium transition-colors`. Reserved for consequential switches — currently only the weather On/Off.
- **Micro unit toggle (`UnitToggle`):** for picking a field's display unit inline beside its label. Container `inline-flex rounded-md border border-[var(--color-border)] overflow-hidden`; buttons `px-2 py-0.5 text-xs font-medium`; active `bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]`, inactive `text-[var(--color-text-tertiary)]`. **Neutral, never red** — several appear at once, so red here would break "keep red rare" even though red-on-active-toggle is otherwise sanctioned.
- **Form inputs:** `rounded-lg border border-[var(--color-border)] px-3 py-3 focus:border-[var(--color-border-focus)] focus:outline-none transition-colors`. Numeric inputs add `text-center text-xl font-tabular font-medium`.
- **Range slider (`RangeField`):** for a bounded setting that reads as a dial rather than a typed value — currently only the fueling carbs/hour target. Apply the `.range-input` class defined in `globals.css`; the track and thumb sit behind vendor pseudo-elements (`::-webkit-slider-runnable-track`, `::-moz-range-thumb`, …) that Tailwind utilities cannot reach, so this one control is styled there rather than inline. Track `0.25rem` in `--color-border`, thumb `1rem` in `--color-red-primary` (greying to `--color-text-tertiary` when disabled). Red is sanctioned here for the same reason as the primary toggle: it's a single instance, not a repeated one. Pair it with a `font-tabular` value readout beside the label and a plain-language hint below the track.
- **Data tables:** wrapper `overflow-x-auto rounded-2xl border border-[var(--color-border)]`; header row `bg-[var(--color-bg-elevated)]` with eyebrow-styled cells; body rows separated by `border-t border-[var(--color-border)]` (no zebra); numeric cells `font-tabular` right-aligned.
- **Stat blocks:** eyebrow label (column-header style) + value `text-2xl font-tabular font-medium text-[var(--color-text-primary)]`, arranged in a `grid grid-cols-3` row bounded by `border-t border-b`.
- **Modal (`PrintModal`):** the app's only centered overlay — a support/ad gate in front of `window.print()`. Backdrop `fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-text-primary)]/40 p-4 print:hidden` (the scrim is a token at 40%, not a new color). Panel `w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)]` — **no shadow**, per "borders over shadows"; header and footer are separated by `border-b`/`border-t` rather than spacing alone. Exactly one red primary action (Print) in the footer; the ✕ is neutral `text-secondary`. Dismissal reuses `usePopover` from the caller (Escape, outside pointer-down), with focus moved to the primary action on open. Reserve this pattern for actions that genuinely warrant blocking the page — inline popovers (`DatePicker`, `TimePicker`) remain the default for in-form choices.
- **Dropdown (`<select>`):** `appearance-none` plus a `<SelectChevron />` inside a `relative` wrapper — never the platform arrow and never a filled `▾`/`▼` glyph, which inherits the font's shape and lands heavier than every other arrow in the app. The chevron is the same `1.75`-stroke inline SVG as the disclosure toggle, pointing down (`viewBox="0 0 20 20"`, path `M4.5 7.5 10 13l5.5-5.5`, `h-4 w-4`, `--color-text-secondary`); position it with a `right-*` class and leave right padding on the select wide enough to clear it. Used by `RaceYearPicker` and the calendar's `FilterSelect`.
- **Disclosure toggle:** a `<button>` styled as an eyebrow (`text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]`) with `flex items-center gap-1.5`, prefixed by a chevron — never a `+`/`−` glyph. The chevron is a `1.75`-stroke inline SVG (`viewBox="0 0 20 20"`, path `M7.5 4.5 13 10l-5.5 5.5`, `h-3.5 w-3.5`), matching the stroke weight used in `DatePicker`'s calendar-nav arrows. It points right (`M7.5 4.5 13 10l-5.5 5.5` as drawn) when collapsed and rotates to point down via `rotate-90 transition-transform duration-150` when expanded (driven by `aria-expanded`). Avoid appending a numeric value summary to the collapsed label (e.g. no "(120 g/hr)"); a plain on/off state suffix like " (on)" is acceptable where the section has a binary enabled state. Used for the Weather & Wind and Fueling Strategy disclosures in `InputForm`.

## Marketing bands (home page)

The home page is a stack of **full-bleed bands** below the hero, following the mcmillanrunning.com rhythm in structure only — none of its palette. Components live in `src/components/home/`.

- **Band:** `<section className="w-full">` edge to edge, with an inner `<div className="mx-auto max-w-7xl px-6 py-20">`. Adjacent bands are separated by `border-y border-[var(--color-border)]` and an alternating `bg-[var(--color-bg-elevated)]` fill — never a shadow or a gap alone. Prose-only bands (the closing CTA) narrow to `max-w-3xl` and `py-24`.
- **Feature row (`FeatureRow`):** `grid items-center gap-12 lg:grid-cols-2 lg:gap-16`, alternating sides via `lg:order-last` on the copy column. The media column carries `min-w-0` so a wide child (chart SVG, table wrapper) shrinks inside its grid track instead of forcing the page to scroll sideways.
- **Bullet mark:** a `1.75`-stroke inline check SVG (`viewBox="0 0 20 20"`, path `M4.5 10.5 8 14l7.5-8`, `h-4 w-4`) in `text-[var(--color-text-tertiary)]` — **neutral, never green**. Green stays reserved for a faster-than-goal delta; a decorative green tick here would break that the way a decorative red would break red.
- **Media is real product UI, never a screenshot.** `computePaceChart` is pure, so `src/components/home/demoResult.ts` builds a real `PacingResult` at module scope and the rows render the actual `ElevationChart`. The page below the hero is a server component, so this runs at build time. Marketing imagery therefore cannot drift out of date with the product, and there is no image weight. Do not import `SummaryHeader` for this — it carries the Stripe/analytics order flow.
- **`PaceBandPreview` is the one sanctioned facsimile.** `PaceBand` is `hidden print:block` with all geometry in the `@media print` block, so it renders as nothing on screen. The preview is a deliberately partial rem-scaled copy (same wordmark bars, columns, and droplet mark) — a teaser, not the band.
- **One red action per page.** The closing CTA's button is the home page's only red besides the hero's Calculate. Course cards and "How it works" links are neutral text/border treatments.

## Printed paceband (`PaceBand.tsx` + `@media print` in `globals.css`)

The only printed surface. Reference dimensions were taken by measuring
paceband.org's print PDF against ours (Aug 2026, both printed from Chrome on
US Letter) — theirs is the wrist-band size runners actually wear:

- **Strip width: 1.3in** (paceband.org measures ≈1.28in; our first pass at
  1.7in printed noticeably too wide to wrap a wrist band).
- **Row height ≈ 11.5pt, 7pt tabular type** — 43 km rows plus wordmark bars
  land at ≈7.4in tall, close to their ≈7.2in. Height only needs to be
  "roughly the same"; width is the constraint that matters for wearing it.
- Wordmark bars top and bottom print in `--color-text-primary` with
  `print-color-adjust: exact`; hairline row borders, no zebra (their
  navy/yellow banding is their brand, not ours).
- The gel cue is a **droplet** icon in `--color-red-primary` (mirrors
  paceband.org's droplet service icons), one per row that carries a
  `FuelingCue`; the column disappears entirely when fueling is off.
- All sizing lives in pt/in inside the `@media print` block so the printed
  scale is independent of screen rem.

## What NOT to do

- Do not introduce new colors. Red, white, black (plus grayscale neutrals), the reserved semantic green, and the closed six-stop course-profile ramp below. Nothing else, and nothing new for a second scale.
- **Course profile carries a six-stop color ramp — one color per profile. This reverses a rule that stood until 2026-09-08, and then a second one written the same day**, so both earlier arguments are recorded here rather than deleted.
  - **The original rule:** a flat/rolling/hilly/mountainous scale is the obvious place to reach for four new colors, so `DifficultyBadge` took red on the two hardest bands only and left the rest neutral, because making red common is the one thing this palette is built to prevent.
  - **The first reversal (three tiers):** the taxonomy changed, not the taste. The badge speaks findmymarathon.com's six labels (Very Flat / Mostly Flat / Rolling Hills / Downhill / Hilly / Very Hilly) so runners read the same vocabulary comparing races there and here, and that vocabulary arrives with a color convention they already associate with it. It was grouped into three tiers — green for the profiles that make a course faster, orange for the middle pair, red for the two that cost you time — to add as few colors as possible.
  - **Why three tiers failed, and this is the useful part:** grouping the six into pairs gave **Mostly Flat and Rolling Hills the same pill**, and those are the two biggest bands in the catalog — 118 and 120 of 326 courses. On 73% of races the color said nothing the label had not already said, while still spending a color. Worse, the pair it collapsed is exactly the boundary runners care about: "do I need hill legs for this?" A ramp whose most common two steps are identical is not a ramp; it is three colors pretending to be six.
  - **The ramp now, fastest to hardest:** Downhill `--color-green-primary`, Very Flat `--color-lime-primary`, Mostly Flat `--color-gold-primary`, Rolling Hills `--color-orange-primary`, Hilly `--color-red-primary`, Very Hilly `--color-red-deep`. **Four of the six already existed** — only lime and gold are new tokens, and the dark end reuses the button-hover red rather than inventing a maroon.
  - **It is a scale, not a set of accents.** Hue falls monotonically at every step (147° → 124° → 70° → 47° → 35° → 32° in CIELAB), and the two red stops, which are only 3° apart, separate on lightness instead (6.47:1 against 10.02:1 on white). Adjacent stops are ΔE00 ≥ 10.2 apart, so no two read as the same color at 12px.
  - **findmymarathon's hue relationships were adopted; their hexes were not.** Theirs are Downhill `#179617`, Very Flat `#3ea618`, Mostly Flat and Rolling Hills both `#ff7800`, Hilly and Very Hilly both `#a6183e` — four colors over six labels, so their site has the same collapse ours had, and three of the four fail WCAG AA as pill text (`#ff7800` is 2.65:1 on white, both greens under 4:1). Ours clear AA on white **and** on `--color-bg-elevated`, where the pill also appears in table rows: 5.02, 4.99, 4.92, 5.18, 6.47, 10.02 on white. Matching their vocabulary is the point; matching their contrast failures is not.
  - **Color is never the only signal.** Each stop pairs with its own icon and its own word, which matters because a green-to-red ramp is the one thing dichromacy compresses hardest — under simulated protanopia the six stops fall to ΔE00 2.7 at the closest pair. The label carries the meaning; the color speeds up recognition for those who can see it. Do not "fix" this by adding a seventh color or a fill — the redundancy is the fix.
  - **`src/app/globals.tokens.test.ts` enforces all of it** — six tokens defined, all distinct, every stop ≥ 4.5:1 on both surfaces, hue monotone. A future pass that swaps in findmymarathon's own hexes to "match their site exactly" fails there, which is the point.
  - **This ramp is the profile pill's alone.** Do not read it as permission for a second one; anything else that wants four colors still gets the answer the original rule gave.
- **The profile badge's second pill — net elevation change — is still always neutral grey.** A net drop makes a course faster, but that is a fact about the course, not a verdict on the runner, and a second colored pill competes with the profile pill for the eye. On a Downhill course it would also only restate what the label already says. (Until 2026-09-08 that pill showed total gain, and briefly turned green on big descents; both were dropped.)
- **The Boston verdict (`BqBadge`) adds no color either, and needed no argument to justify one.** `SummaryHeader`'s "vs goal" note already paints slower-than-target red and faster-than-target green; "2:14 under your standard" is that same meaning in that same component, so the two reserved semantics carry over unchanged. The **net-downhill index pill stays neutral** — an index is a fact about the course, true whoever runs it, not a verdict on the runner, and coloring it would imply the race did something wrong. Both `BqBadge` and `DifficultyBadge` stay two pills — a single chip would have to pick one of two independent facts and misrepresent the other.
- Do not use shadows beyond the system default.
- Do not use red for decoration (backgrounds, hover states on non-interactive elements, etc.).
- Do not introduce new font sizes outside the typography scale.
- Do not use Tailwind's `zinc-*`, `gray-*`, or named-color utilities directly. Always reference design tokens.
- Do not hardcode `bg-white`/`text-black` or add `dark:` variants. Colors live entirely in the token values in `globals.css`; the app is light mode only.
