# eveneffort — Design System

A unified, disciplined visual language for the app. Red, white, black. Nothing else.

## Principles

1. **Surface-dominant.** The page is white. The surface dominates and whitespace is the primary tool. Color is rare and meaningful. The app is light mode only — there is no dark mode and no in-app toggle.
2. **Red is reserved.** Red appears only on interactive primary actions (Calculate button, active toggle), and as a meaningful data signal (uphill elevation deltas). It should not be used for decoration.
3. **Type carries the brand.** Montserrat carries the whole site — headings and body. The original Fraunces serif is kept only for the "eveneffort" wordmark. Tabular numerals everywhere numeric data appears.
4. **Borders over shadows.** Hierarchy is built with 1px borders and generous radius, not drop shadows.
5. **One source of truth.** All colors, fonts, and radii live in `src/app/globals.css` as design tokens. No hardcoded values in components.

## Color tokens

Defined in the `@theme` block of `src/app/globals.css`. Reference in components as `[var(--token)]` Tailwind arbitrary values — never as `zinc-*`/`gray-*`/`red-*` named utilities.

| Token | Value | Usage |
|---|---|---|
| `--color-red-primary` | `#B91C1C` | Primary action backgrounds, active toggle, uphill elevation delta |
| `--color-red-deep` | `#7F1D1D` | Primary action hover state |
| `--color-bg-page` | `#FFFFFF` | Page background (set on `html`) |
| `--color-bg-surface` | `#FFFFFF` | Card / surface background |
| `--color-bg-elevated` | `#FAFAFA` | Table header, hover fill, chart area fill |
| `--color-text-primary` | `#0A0A0A` | Headings, primary values, chart line |
| `--color-text-secondary` | `#525252` | Body, helper text, downhill delta, row labels |
| `--color-text-tertiary` | `#A3A3A3` | Eyebrows/column headers, zero delta, axis labels |
| `--color-border` | `#E5E5E5` | All 1px borders, gridlines, disabled button bg |
| `--color-border-focus` | `#0A0A0A` | Input focus border |

## Theme

Light mode only. There is no dark mode: no `@media (prefers-color-scheme: dark)` block, no `dark:` variants, no component-level theme logic. `color-scheme: light` is set on `html` so native controls, spinners, and scrollbars stay light.

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
- **Secondary toggle (pill group):** container `inline-flex rounded-lg border border-[var(--color-border)] overflow-hidden`; active button `bg-[var(--color-red-primary)] text-white`, inactive `bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]`; each `px-6 py-2.5 text-sm font-medium transition-colors`.
- **Form inputs:** `rounded-lg border border-[var(--color-border)] px-3 py-3 focus:border-[var(--color-border-focus)] focus:outline-none transition-colors`. Numeric inputs add `text-center text-xl font-tabular font-medium`.
- **Data tables:** wrapper `overflow-x-auto rounded-2xl border border-[var(--color-border)]`; header row `bg-[var(--color-bg-elevated)]` with eyebrow-styled cells; body rows separated by `border-t border-[var(--color-border)]` (no zebra); numeric cells `font-tabular` right-aligned.
- **Stat blocks:** eyebrow label (column-header style) + value `text-2xl font-tabular font-medium text-[var(--color-text-primary)]`, arranged in a `grid grid-cols-3` row bounded by `border-t border-b`.

## What NOT to do

- Do not introduce new colors. Three colors only: red, white, black (plus grayscale neutrals).
- Do not use shadows beyond the system default.
- Do not use red for decoration (backgrounds, hover states on non-interactive elements, etc.).
- Do not introduce new font sizes outside the typography scale.
- Do not use Tailwind's `zinc-*`, `gray-*`, or named-color utilities directly. Always reference design tokens.
- Do not hardcode `bg-white`/`text-black` or add `dark:` variants. Colors live entirely in the token values in `globals.css`; the app is light mode only.
