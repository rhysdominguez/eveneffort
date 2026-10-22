# eveneffort — Product Roadmap

**Goal:** the world's most advanced course-specific pacing calculator. No mainstream
calculator should have a feature eveneffort lacks.

This file is the tracker. **It is updated as part of every project's commit** — see
Rule 10 in CLAUDE.md. A project is not done until its row here says so.

**Every project carries a checkbox, on its status-board row and on its own heading.**
`[ ]` is unbuilt, `[x]` is shipped, `[~]` is partial, reverted or deferred (a project
that went out and came back, or that shipped one half of itself). Tick **both** boxes
in the same commit as the work, alongside flipping the Status column to `Done` and the
date, and add the one-line note on anything that turned out differently from the plan.
Two boxes means the file reads the same whether someone scans the board or lands
mid-document from a link. A half-ticked project — one box, or a tick with the status
still `Not started` — is a bug in the tracker, not a state.

Projects are ordered by **technical ease**, easiest first, so the cheapest wins ship
first. Ease is judged on: does it touch the schema, does it need new data, does it
need new human research, and does it touch the locked pacing algorithm.

**Numbers are permanent and are never reused.** 31 code comments cite projects by
number (`ROADMAP #7`, `#8`, `#10`, `#12`), so renumbering would silently repoint every
one of them at the wrong explanation. A retired or reverted project keeps its number
and its write-up rather than being deleted — §2 and §18 are both here for that reason.
This file holds all of them, 1 through 24, so a number cited anywhere in the codebase
resolves in one place.

## Status board

| #   | Project                                                    | Phase | Ease  | Status                                    |
| --- | ---------------------------------------------------------- | ----- | ----- | ----------------------------------------- |
| 1   | [x] Split strategy (negative / positive, aggressive)       | 1     | ●○○○○ | **Done** 2026-08-30                       |
| 2   | [~] Conservative start options                             | 1     | ●○○○○ | **Reverted** 2026-09-08 — UI removed      |
| 3   | [x] Goal as pace or GAP pace                               | 1     | ●●○○○ | **Done** 2026-08-30                       |
| 4   | [~] Dew point as the humidity input                        | 1     | ●●○○○ | **4a done** 2026-08-30 · 4b deferred      |
| 5   | [x] Course difficulty rating + fastest-course ranking      | 2     | ●○○○○ | **Done** 2026-08-30                       |
| 6   | [x] Nav restructure (tools in the navbar)                  | 2     | ●●○○○ | **Done** 2026-08-31                       |
| 7   | [x] Altitude penalty                                       | 2     | ●●●○○ | **Done** 2026-09-16                       |
| 8   | [x] Race comparison / time conversion calculator           | 2     | ●●○○○ | **Done** 2026-09-04                       |
| 9   | [~] Boston qualifier standards + per-race BQ status        | 3     | ●●●●○ | **9a + 9b done** 2026-09-04 · 9c blocked  |
| 10  | [x] Bring your own course (GPX / KML / Strava upload)      | 3     | ●●●●● | **Done** 2026-09-04                       |
| 11  | [x] Stop the calculator driving the address bar            | 3     | ●●○○○ | **Done** 2026-09-17                       |
| 12  | [x] Course cost model: fix the race-time conversion        | 3     | ●●●○○ | **Done** 2026-09-18                       |
| 13  | [x] Hill segments — name the climbs that matter            | 4     | ●●○○○ | **Done** 2026-09-20                       |
| 14  | [x] Race-day weather panel on the results page             | 4     | ●●○○○ | **Done** 2026-09-23                       |
| 15  | [x] Course elevation profile in the ranking table          | 4     | ●●○○○ | **Done** 2026-09-20                       |
| 16  | [x] Per-factor impact breakdown                            | 4     | ●●●○○ | **Done** 2026-09-21                       |
| 17  | [x] Per-factor split adjustments chart                     | 4     | ●●○○○ | **Done** 2026-09-22                       |
| 18  | [~] Extend the forecast horizon to 14 days                 | 5     | ●●●○○ | **Deferred** 2026-09-21                   |
| 19  | [x] Forecast-available highlight on the calendar           | 5     | ●●○○○ | **Done** 2026-09-21                       |
| 20  | [x] Night mode toggle                                      | 6     | ●●●○○ | **Done** 2026-09-21                       |
| 21  | [x] Course outline map (static)                            | 7     | ●●●●○ | **Done** 2026-09-21                       |
| 22  | [x] Interactive course map                                 | 7     | ●●●○○ | **Done** 2026-09-22                       |
| 23  | [x] Systematic sweep of the races we do not have           | 8     | ●●●●○ | **Done** 2026-09-25                       |
| 24  | [ ] Apple Watch per-kilometre pace prompts                 | 8     | ●●●●● | Not started                               |
| 25  | [x] Pace opportunity meter                                 | 4     | ●●○○○ | **Done** 2026-09-22                       |

**Phases 1-3 (projects 1-12) shipped between 2026-08-30 and 2026-09-18.** Read them
before touching anything they describe: several of their findings are load-bearing for
the projects that follow, and the ones that are are cited by number.

**One rule applies to every project from #13 onward and is worth stating once.** Each
of those arrived with a screenshot from another app. The screenshots are references for
**functionality, not for design.** Nothing in them — the amber pills, the green
stat cards, the 3 km bucketing, the icon set — comes across. Everything ships in
this site's own system: tokens from `globals.css`, the red/white/black/grayscale
palette with its two closed exceptions, no new ramp (Rule 2), and the segmentation
the runner already chose (km or miles, never a third increment). `DESIGN.md` is the
reference, not the screenshot.

---

# Phase 1 — pure math and form work

No schema change, no new data, no new research. All four are confined to
`src/lib/pacing/`, `src/lib/weather/`, `src/components/InputForm.tsx` and
`src/lib/resultsParams.ts`.

## 1. [x] Split strategy — negative / positive, with aggressive variants

**Status:** Done 2026-08-30 · **Ease:** ●○○○○

The single biggest competitive gap. eveneffort offers exactly one strategy: pure
even effort. FindMyMarathon offers even-pace, even-effort and four split levels;
Garmin PacePro and ultraPacer both offer negative and positive.

**What it entails**

- A new pure module, `src/lib/pacing/strategy.ts`, exporting a bias function that
  returns a per-segment multiplier given a strategy and the segment's fractional
  distance through the race. A linear ramp is enough: `1 + b·(2·f − 1)` where `f`
  is the fraction of total distance elapsed and `b` is the bias (e.g. ±0.015 for
  standard, ±0.03 for aggressive).
- Apply it in `computeElevationDurations` **before** `normalizePaces`
  ([index.ts](src/lib/pacing/index.ts)). Because normalization is a single scalar
  pass, the goal finish time stays exact for free — that property is what makes
  this cheap.
- `adjustmentFactor` and the Minetti math are **not touched** (Rule 1 stays clean).
- Add `strategy` to `PacingInput` in [src/types/index.ts](src/types/index.ts), to
  the URL params in `src/lib/resultsParams.ts`, and a select to the dashboard side
  of [InputForm.tsx](src/components/InputForm.tsx). Default stays `even-effort`, so
  every existing shared link and printed paceband keeps resolving identically.
- Also add plain **even pace** (ignore grade entirely) as an option — it is one
  branch and FindMyMarathon has it.

**Tests:** even-effort output byte-identical to today; every strategy still sums
exactly to the goal; negative-split second half is strictly faster than the first
on a flat course; aggressive is strictly more biased than standard.

**Shipped as planned**, with three notes:

- The URL param for #2 is **`hold`**, not `start` — `start` was already taken by
  the race start time. `split` is as planned. Both are emitted only when
  off-default, so a default chart's query string is byte-for-byte what it was
  before this landed.
- The biases are read at each segment's **midpoint distance**, so km mode (43
  segments) and miles mode (27) get the identical curve rather than one
  quantized to whichever unit is on screen.
- The controls are dashboard-only, alongside Weather and Fueling. The hero form
  stays core setup + Calculate, and always builds the defaults.
- **2026-09-08:** the split control became a **five-stop slider** (`RangeField`,
  the same component fueling uses) — strong negative · negative · even effort
  (default, centre) · positive · strong positive. Each stop still maps to one of
  the existing `SplitStrategy` presets, so the engine, `SPLIT_BIAS`, the URL
  format and printed pacebands are untouched. **`even-pace` ("ignore hills") was
  dropped from the form** at the same time — it is a different axis and did not
  belong on the slider; it still parses from older links and just lands the
  slider on the middle stop.

## 2. [~] Conservative start options

**Status:** Reverted 2026-09-08 (shipped 2026-08-30) · **Ease:** ●○○○○

**The "Start" control was removed from the dashboard form on 2026-09-08** — a
product call that the split-strategy selector is enough race-strategy surface for
now, and a second dropdown next to it was more choice than clarity. The section
heading is now just "Split Strategy". Only the `InputForm` UI went; the
`strategy.ts` math (`startBias`, `START_SURCHARGE`, `START_TAU_KM`) and the
`hold=` URL param parsing in `resultsParams.ts` are left in place so pacebands
people have already paid for keep resolving, and re-adding the control later is a
UI-only change. `input.start` is simply never set by the form now, so it defaults
to `"even"` (a no-op surcharge).

Evenly paced / conservative / very conservative first miles. FindMyMarathon has
exactly this, and it is the most-given piece of real-world marathon advice.

**What it entails**

The same mechanism as #1 with a different curve shape: instead of a ramp across the
whole race, a decaying penalty over roughly the first 5 km that pays itself back
across the remainder. Ships into the same `strategy.ts` as a second, independent
control — the two compose (a runner can want a conservative start *and* an even
race thereafter). Same normalization guarantee, same test shape.

Realistically this lands in the same session as #1.

**It did.** The curve is `1 + s·e^(−d/2.5 km)`, s = 4% / 8%, so the penalty is
spent over roughly the first 5 km and never hard-edges at a segment boundary the
way a "first 3 miles" step would. Nothing computes the payback — `normalizePaces`
does it for free, which is the same property that keeps the finish exact.

## 3. [x] Goal expressed as pace or normalized (GAP) pace

**Status:** Done 2026-08-30 · **Ease:** ●●○○○

Today the only way in is a finish time you must already know. ultraPacer accepts
elapsed time, average pace, or normalized pace.

**What shipped**

- `src/lib/pacing/effort.ts` — a new PURE module that only reads the locked
  algorithm. It computes a course's **flat-equivalent distance**,
  `Σ(lengthKm × adjustmentFactor)`, and the four conversions either way.
- The inversion turned out to be **exact, not approximate**, and that is worth
  recording: because `normalizePaces` is a single scalar pass, every segment's
  flat-equivalent pace is the *same* constant, `goalTime / Σ(lengthKm · adj)`.
  So GAP → time is one multiply and the round-trip has no drift.
  `effort.test.ts` asserts it segment-by-segment against the real engine.
- Toggle labels are **Time / Pace / GAP**, and the mode's own value is what the
  form holds canonically. That is the feature: switching course in GAP mode
  holds the pace and moves the finish time.

**Three things that differed from the plan**

1. **It needed a catalog field.** The hero form only ever receives
   `CourseSummary`, so GAP would have been dashboard-only. `CourseSummary.effort`
   (two scalars, ~16 bytes/course) is computed server-side in `queries.ts` from
   elevations that never reach the client — which is why GAP works on the
   homepage too. This is **#5's core computation, built early**; see #5.
2. **The two segmentations disagree by more than expected.** km and mile
   segmentation give effort figures up to **0.43% apart** on Pikes Peak (minutes
   over a marathon), not the tenth of a percent assumed. Both are shipped rather
   than one standing in for the other.
3. **Strategy (#1/#2) interacts, and safely.** The split/start biases re-weight
   durations before the same normalization, so they change *when* effort is
   spent, not how much the course demands. The per-segment identity holds only
   at the default strategy; the race-average one — which is what the goal field
   means — holds under all of them, `even-pace` included. Pinned by a
   cross-feature test, because nothing else would have caught it.

The mode is **not in the URL**: a shared link stays a finish time, so every
existing link and printed paceband is untouched. The preference persists in
localStorage (`prefs.goalMode`) instead.

**Update 2026-09-08:** GAP was pulled from the hero form and is now dashboard-only
after all — the hero is core race setup plus Calculate, and grade-adjusted pace
only earns its place next to a chart. The `CourseSummary.effort` field (plan
point 1) still ships; it feeds #5's rankings and the comparison page regardless.

Still deliberately **not** in scope: race-time prediction from a recent result
(Riegel/VDOT). Separate project, different claim.

## 4. [~] Dew point as the humidity input

**Status:** 4a done 2026-08-30 · 4b still open · **Ease:** ●●○○○

Dew point is what running science and coaches actually quote (Runners Connect,
Running Writings, Coach Saltmarsh all take it). eveneffort takes relative humidity.

**4a — shipped.** A `%`/`dew` toggle on the humidity field, reusing the existing
Magnus pair in `src/lib/weather/progression.ts` rather than writing a second
one. RH remains the canonical stored/URL value, so nothing downstream changed
and no existing link moved. The preference joins `prefs.displayUnits`.

Three details that were not obvious from the plan:

- **Editing the temperature holds the DEW POINT, not the RH.** Someone who typed
  a 12 °C dew point and then nudges the temperature expects their dew point to
  stay put; RH is recomputed underneath. Stateless — derive dew from the
  pre-change conditions and patch both fields at once. It is also the same
  conservation `synthesizeHourly` already assumes across a race morning. RH mode
  keeps the old behaviour exactly.
- **The field's bounds have to change with the mode.** `NumericField` strips the
  minus key outright whenever `min >= 0`, so leaving the RH bounds (0–100) in
  place would make a below-freezing dew point literally untypeable. In dew mode
  `min` is unset and `max` is the air temperature itself.
- **Dew point is a temperature**, so it renders through the existing °C/°F
  toggle rather than getting one of its own. A whole °F is a coarser step than a
  whole percent, so editing in °F moves RH by up to ~1 point — well below what
  the heat model resolves, but it is why the unit test asserts a band.

**4b (deferred, medium):** replacing the NWS heat-index curve in
`src/lib/weather/heat.ts` with a dew-point-based model. Worth considering
separately against the Running Writings curve, which is fit to 3,891 marathoners
across 754 races versus our hand-anchored piecewise line. That is a model change
and needs its own justification and tests — 4a deliberately did not touch it, so
every existing chart is byte-identical.

---

# Phase 2 — derived from data we already hold

Still no new source data. These compute new things from the 44-point elevation
arrays and the existing catalog.

## 5. [x] Course difficulty rating + fastest-course ranking

**Status:** Done 2026-08-30 · **Ease:** ●○○○○ — the score came free from #3

Color-coded flat / rolling / hilly / downhill classification in the UI, the way
FindMyMarathon presents it, plus a "fastest courses" sort.

**Already done, by #3 (2026-08-30).** The score this project was going to build
is `effortMultiplier()` in [src/lib/pacing/effort.ts](src/lib/pacing/effort.ts),
and it already ships to the client on `CourseSummary.effort` for the whole
catalog. #3 needed it to turn a grade-adjusted pace into a finish time, so it
was built once, there. Nothing about the computation is left to do.

**The measured spread, which is what makes the thresholds designable** — across
all 326 seeded courses:

| | course | multiplier |
|---|---|---|
| easiest | REVEL Mt Charleston (~1,500 m net drop) | 0.936 |
| | St. George | 0.969 |
| typical road marathon | Berlin / Chicago | ≈1.000 |
| | Blue Ridge | 1.006 |
| hardest | Pikes Peak | 1.071 |

Note how tight the middle is: the great majority of road courses sit within
±0.5% of flat, so a naive even split into four buckets would put nearly
everything in one. The banding needs to be chosen against this distribution, not
against round numbers — that judgement is now the *main* remaining work.

**What shipped, and the finding that reshaped it**

The multiplier is the right number for *how fast a course is* and the wrong one
for *how hilly it is*, and the table above is why: 308 of the 326 courses sit
between 0.985 and 1.005, because climbing and descending very nearly cancel
under Minetti. Prosecco climbs 194 m and scores 1.0008 — indistinguishable from
pancake-flat Chicago. **Banding it four ways would have labelled 94% of the
catalog identically.** So the project shipped two numbers on two axes instead of
the one the plan assumed:

- **Terrain** — total gain, loss and net change, in
  [src/lib/pacing/terrain.ts](src/lib/pacing/terrain.ts), read off the raw
  (unsmoothed) 44-point array. Gain and loss are per-kilometre figures — an
  honest floor, not surveyed gain, and the module header says so; net change is
  exact. This drives the six-way course-profile label.
- **Speed** — `effortMultiplier`, unchanged from #3. This drives the ranking and
  is what #8 will convert times with.

Boston is the case that proves both are needed: it climbs enough to be
**rolling** and still runs **0.6% faster than flat**, because the net drop more
than pays for the Newton hills. One number cannot say that. (Since 2026-09-08 it
*labels* as **Downhill** for that same reason — see the taxonomy note below —
but the two-axis point stands: the label and the cost line say different things.)

**The taxonomy now matches findmymarathon.com** (updated 2026-09-08). It was
flat / rolling / hilly / mountainous on bands of 75 / 150 / 400 m, calibrated
against races whose character is not in dispute; it is now the six labels
runners already read on the biggest race-comparison site — **Very Flat / Mostly
Flat / Rolling Hills / Downhill / Hilly / Very Hilly** — on gain bands of **25 /
85 / 215 / 355 m**, splitting the catalog 20 / 118 / 120 / 28 / 22 / 18.
`terrain.test.ts` pins that split, so no band edge can move quietly.

Those cuts were **fitted, not chosen**. findmymarathon publishes no formula —
their FAQ calls the profile "subjective… based on the course profiles, course
elevations, runner opinions, and race organizer descriptions", i.e. a
hand-assigned field. But their race feed exposes a label plus gain/loss per
race, and **103 of those races join to our seeded courses by GPX start
coordinate**, giving a ground-truth set to grid-search against: the shipped cuts
score **77% exact agreement, 98% within one band**, where the old bands mapped
naively scored 59%. Every surviving disagreement is an adjacent call, which is
the irreducible part of reproducing a subjective field with a threshold.

Two findings from that exercise are worth not rediscovering:

- **The 44-point `gainM` is the best predictor we have** (r = 0.902 vs their
  gain). Gain re-derived from the dense `profile` array is *worse* — r = 0.819
  with 3 m hysteresis, r = 0.700 raw — because raw trace noise scales with the
  recording device, not the terrain. Tokyo's 2,922-point profile yields 2,179 ft
  of "gain" for a course everyone calls mostly flat. The coarse array's uniform
  sampling is the whole point, and the taxonomy therefore needed **no schema,
  query, seed or `CourseSummary` change**.
- **`netM` is comparable across sites even though `gainM` is not.** Recording
  noise inflates gain and loss together and cancels in the difference: Boston
  nets −436 ft here against their −460, Marquette −806 against −810.

**Downhill is an override, not a rung**, which is also how findmymarathon does
it — Boston is listed there as Downhill despite 96 m of climbing, and is here
now too. But **hills win when a course is both**: Big Sur drops 91 m and stays
Hilly. That tie-break is theirs, not an invention — in their data every
big-drop race that keeps a hill label instead (Big Sur, Loch Ness, Deadwood,
Breckenridge) is one with large gain. `NET_DOWNHILL_M` moved −100 → **−75 m**
(≈ −246 ft) in the same pass, which is where their labelling turns over and,
more to the point, is what finally catches **CIM at −91 m** — the canonical
net-downhill BQ course, which −100 m missed.

**The second pill shows net change, not total gain** (updated 2026-09-08).
"847 ft up" next to the terrain word read as a contradiction on a loop course
that climbs hundreds of feet and returns to its start — the number never matched
the elevation profile beside it. The second pill now always shows net change
(finish minus start, exact at any resolution) — "Downhill" + "−436 ft net" for
Boston — and the earlier green-when-downhill pill (which only appeared for the 27
big descents) is retired. Total gain is still the input to the band label and
still a sortable column in the ranking table; it just no longer sits on the
badge.

**The profile pill now carries a six-stop colour ramp** (updated 2026-09-08).
This paragraph previously read "no palette was added… deliberately no four-step
difficulty ramp", and that position lasted until the six findmymarathon labels
landed: adopting their vocabulary brought their colour convention with it.
It shipped first as three tiers — green / orange / red over the six labels —
which was wrong for a reason worth recording: pairing the labels gave **Mostly
Flat and Rolling Hills the same pill**, and those are the two biggest bands in
the catalog (118 and 120 of 326 courses), so on 73% of races the colour told the
runner nothing while still spending a colour. It is now one stop per profile,
fastest → hardest: green, lime, gold, orange, red, red-deep. **Four of the six
were tokens the palette already had** — only `--color-lime-primary` and
`--color-gold-primary` are new. Hue falls monotonically at every step and every
stop clears WCAG AA on white and on the elevated surface, which
[src/app/globals.tokens.test.ts](src/app/globals.tokens.test.ts) enforces;
findmymarathon's own hexes would fail it (their `#ff7800` is 2.65:1 on white,
and they too give two labels one colour). `TERRAIN_TIER` is gone, replaced by
`TERRAIN_ORDER`. The net-change pill is **still always neutral grey**: a net
drop makes a course faster, but that is a fact about the course, not a verdict,
and a second coloured pill competed with the profile pill for the eye.
DESIGN.md carries the full argument and both positions it replaced.

**Also shipped:** `/courses`, the sortable ranking (speed, climbing, net change,
name), linked from the nav, the footer and the Course Library band, and in the
sitemap. `metresToFeet` moved to
[src/lib/units/elevation.ts](src/lib/units/elevation.ts), out of two copies in
ElevationChart and its test.

**Follow-up, 2026-09-16:** the ranking table gained the calendar's location
filter (continent -> country -> state/province) plus a live count of what
survives it. The cascade moved out of `src/components/home/calendarFilters.ts`
to [src/lib/locationFilter.ts](src/lib/locationFilter.ts), generic over a
structural `Locatable` rather than `EditionSummary`, and the three selects moved
to [src/components/LocationFilterBar.tsx](src/components/LocationFilterBar.tsx)
so both lists narrow through one control. The region level keeps hiding itself
unless the chosen country has races in two or more of them, which today means
the US, Canada and Australia.

The whole row is now the click target, opening `/results` with that course set
up. The race name stays a real `<a>` (keyboard, crawlers, right-click); the row
handler only widens the target for a mouse, gets out of the way when the click
already landed on the link, and opens a tab on a modified click. The href moved
to `buildResultsHref` with `DEFAULT_FUELING`, because the hand-built query left
`carbs` out and InputForm reads that absence as "the runner turned fueling off",
so every row had been landing on a chart with the gel cues missing.

**Narrowed deliberately:** the badge is on the results header only. The course
picker, the race calendar and the map popups were dropped — the calendar would
need a courseId→terrain map threaded in from the home page, since
`EditionSummary` carries no geometry, and 326 badges on date chips is noise, not
information.

## 6. [x] Nav restructure — put the tools in the navbar

**Status:** Done 2026-08-31 · **Ease:** ●●○○○

[SiteNav.tsx](src/components/SiteNav.tsx) currently contains the wordmark and
nothing else — there are no nav links at all. A second calculator (#8) has nowhere
to be linked from, so this is its prerequisite.

**What it entails**

- **The links, as data.** A `NAV_LINKS` const array at the top of the file, the way
  [SiteFooter.tsx](src/components/SiteFooter.tsx) already holds `LINK_COLUMNS` — so #8
  adds its route by appending one object rather than editing markup. Entries: Pacing
  calculator → `/`, Race comparison → `/compare`, Methodology → `/methodology`.
  **Ship #6 with two of them.** `/compare` does not exist until #8, and a nav link to a
  404 is worse than a nav that grows by one line later; the array is the deliverable
  here, the third entry lands with the page. Sentence case, to match the footer. The
  footer's Product column now names the same two destinations, so reword it to say the
  same words the nav does.
- **Active state is free** — the component already calls `usePathname()` for `isHome`.
  `aria-current="page"` plus `text-[var(--color-text-primary)]`, against
  `text-[var(--color-text-secondary)]` for the rest. `/results` has no entry of its own
  and should light up the pacing calculator: it is that tool's output, not a fourth
  place.
- **The height constraint is arithmetic, not taste.** The inner row is
  `flex items-center` and its height today *is* the wordmark's 32px
  (`text-[2rem] leading-none`); the padding it gives up compressing (24px → 8px a side,
  32px total) is exactly the `mb-8` handed back. Any item taller than 32px raises both
  states — the margin accounting still balances, but the bar is no longer the height it
  was. So keep every item ≤ 32px: links at `text-sm py-1` are 28px, an icon button at
  `h-8 w-8` is 32px on the nose. If something doesn't fit, shrink the control; do not
  re-derive the padding/margin pair.
- **The mobile treatment is the real work.** Below `sm` the link row is `hidden sm:flex`
  and a 32px icon button opens a panel. The panel must be `absolute top-full inset-x-0`
  off a now-`relative` `<nav>` — **never in flow**, since an in-flow panel changes the
  bar's height and reintroduces exactly the scroll-anchor shake the compress accounting
  exists to prevent. Reuse [usePopover.ts](src/hooks/usePopover.ts) as-is for Escape and
  outside-pointer dismissal; it has no route-change behaviour, so add a `useEffect` on
  `pathname` that closes, or a tapped link leaves the panel hanging over the new page.
  Panel chrome follows the modal precedent in `DESIGN.md` (surface fill, a border, no
  shadow) — the `*-on-dark` tokens are footer-only and stay there.
- **The hamburger is a new glyph.** No icon library and none coming (Rule 5): every icon
  in the repo is a hand-drawn `viewBox="0 0 20 20"` inline SVG at stroke `1.75`, and this
  one matches or it looks foreign. `aria-hidden` on the SVG; `aria-label`,
  `aria-expanded` and `aria-controls` on the button.
- **Break at `sm`.** Only `sm:` and `lg:` appear anywhere in this codebase, and `sm` is
  the seam [RaceCalendar.tsx](src/components/home/RaceCalendar.tsx) already uses for its
  grid → agenda-list swap. Follow it rather than introducing `md:` for one component.
- Nothing else moves: no new route, so no sitemap entry, and `print:hidden` is already on
  the `<nav>` and stays — the paceband print output is untouched.

**Tests:** there is no `SiteNav.test.tsx` and nothing in the repo mocks `next/navigation`
yet, so this writes the first `vi.mock("next/navigation", …)`. Assert the link set
renders; `sticky` present off home and absent on `/`; the compress classes still pair
`py-6`↔`mb-0` and `py-2`↔`mb-8`; the mobile panel opens, closes on Escape, and closes on
pathname change; `print:hidden` survives. Also rename the first case in
[SiteFooter.test.tsx](src/components/SiteFooter.test.tsx) — "the content pages that
previously had no nav route in" stops being true the moment this ships.

**Shipped as planned**, with two notes:

- The link array shipped with **three** entries, not two. #5's course rankings page
  landed in the same stretch of work and took a slot; `/compare` is still deferred to #8
  exactly as planned. Because entries are now demonstrably going to keep arriving, the
  mobile panel's test counts its links against the desktop row rather than a literal —
  #8 appends one object and touches no test.
- `usePopover` needed the one thing it does not provide: it knows pointers and keys but
  not routing, and a client-side navigation unmounts nothing in the nav, so a `useEffect`
  on `pathname` closes the panel. Everything else — Escape, focus return, outside
  pointer-down — came free. The height invariant held without any padding change: the
  links are 20px of line box and the menu button is `h-8`, both inside the wordmark's
  32px, so the `py`/`mb` pair is untouched.

## 7. [x] Altitude penalty

**Status:** Done 2026-09-16 · **Ease:** ●●●○○

Today `src/lib/weather/wind.ts` hardcodes sea-level pressure (101325 Pa), so a race
at 2,000 m gets sea-level air density and no aerobic penalty at all. ultraPacer,
Stryd and MyMarathonPace all model altitude.

**No schema change and no new data.** `course.elevations` is already *absolute
metres above sea level* (see the field comment in
[src/db/schema.ts](src/db/schema.ts)) — the mean elevation of any course is a reduce
over an array we already ship. This was the project's feared blocker and it is not one.

**What it entails — two independent halves**

- **7a — air density (easy, strictly a correctness fix).** Replace the hardcoded
  pressure with the barometric formula evaluated at each segment's own elevation.
  The drag model is already per-segment, so this slots in where the constant is. On
  a high course this makes the runner *faster* (thinner air, less drag), which is
  physically right and is the opposite sign to 7b.
- **7b — aerobic cost (medium, needs care).** A VO2max-decrement curve above roughly
  1,000–1,500 m. This is a real physiological model addition, needs a cited source
  and its own test suite, and unlike 7a it will change results for every course
  above the threshold. Must not silently change any sea-level course — assert that
  in a test.
- Consider surfacing acclimatization later as an input; out of scope here.

**Shipped, both halves, as planned.** `src/lib/pacing/altitude.ts` is the new
module; `src/lib/weather/wind.ts` gained `pressureAtElevationPa` for 7a. The
prediction that there was no blocker held: no schema change, no new data, and
the whole thing is a reduce over the 44 points the catalog already reads.

What turned out differently:

- **The threshold is a judgement call, not a lookup.** The plan said "roughly
  1,000-1,500 m". The source chosen for the decrement (Wehrlin & Hallen 2006,
  6.3% of VO2max per 1,000 m in trained endurance athletes) actually measured
  the decline starting near **300 m**, which is lower than coaching practice
  assumes and would have put a visible penalty on Madrid, Munich and a long
  tail of ordinary European road races. Taking it literally was a bigger claim
  than this product should make quietly, so the decrement runs from 1,000 m.
  The argument is in the module header; if it is ever revisited, that is the
  paragraph to argue with.
- **The multiplier is averaged per kilometre, not evaluated at the mean
  elevation.** It is convex and the threshold makes it piecewise, so a course
  that starts low and climbs high is badly described by its mean. Costs one
  more reduce, and gets Pikes Peak (2,960 m mean, 4,277 m high point) right.
- **7a and 7b have opposite signs, so they shipped together**, as the plan
  implied but did not say outright. Shipping only the air-density half would
  have made Denver read *faster*, which is true of the drag and false of the
  race.
- **The sea-level guard the plan asked for is stronger than a unit test.**
  `altitude.test.ts` walks every course file on disk, not the seven-course
  fixture, because the fixture is the majors and is entirely at sea level: it
  could not tell this model from one that returned 1.0 unconditionally.

**Where it surfaces.** Not in the splits, deliberately, and this is the one
open question left. Altitude is a thing *said about* a course today, not a
thing *done to* a paceband:

- A third pill on `DifficultyBadge`, beside the profile and net-change ones,
  reading "6562 ft elevation". **Revised 2026-09-17:** it shipped as "6562 ft
  up, 7.0% slower" and absent below the threshold (298 of 326 courses). Both
  halves of that were wrong for the same reason: the penalty is already inside
  the "vs flat" sentence directly beneath it, so the pill quoted a cost the
  reader had no way to reconcile with the one next to it, and it went silent on
  the low majority where the plain height is still worth knowing. The pill now
  shows wherever altitude is supplied and says height only.
- A sortable **Altitude** column on `/courses`, showing mean height for every
  course. **Revised 2026-09-17** the same way: it printed "7.0% slower" with
  the height as a subscript and an em dash on the low majority, one column
  left of "vs flat", which is that same penalty multiplied by the grade cost.
  It now prints feet, sorts on `meanM` rather than the multiplier (so the flat
  block below the threshold no longer ties at exactly 1), and needs no
  placeholder glyph, so `CourseRankingTable.tsx` came back out of
  `PLACEHOLDER_GLYPH_ALLOWED` (Rule 11). `formatAltitudePenalty` had no callers
  left and was deleted; `hasAltitudePenalty` stays in `altitude.ts` as the dead
  band.
- Folded into **"vs flat"** everywhere it appears, via `totalEffortMultiplier`
  in `src/lib/units/effort.ts`. That is a display-layer product: `effort` stays
  geometry-only on the wire and in `equivalentGoalTime`, so **no chart, no
  split and no shared link moved**. The Minetti curve reads gradient alone and
  is untouched (Rule 1).
- A methodology section naming the source and the threshold.

Sanity check against the seeded catalog: La Paz 20.2%, Leadville 18.1%, Pikes
Peak 14.4%, Denver Colfax 4.1%, Boulderthon 3.9%. 28 of 326 courses clear the
0.5% dead band.

**Open: should the penalty extend the finish time?** `/compare` now says a 3:20
at Berlin is worth more time at Boulder, but the pacing chart at Boulder still
hands back exactly the goal you typed. Weather already sets the precedent for
the other behaviour: heat and wind multipliers are applied after normalization
and deliberately push the finish past the goal. Doing the same with altitude is
a one-line change in `computePaceChart` and a real product decision, because it
changes the headline number on the results page for ~28 courses. Not taken
unilaterally.

## 8. [x] Race comparison / time conversion calculator

**Status:** Done 2026-09-04 · **Ease:** ●●○○○

"Your 3:20 at Boston is 3:14 at Berlin." FindMyMarathon has this; eveneffort holds
better inputs for it than they do, across 326 courses.

**What it entails**

- The math is **already free**: each course's effort multiplier `E` ships on
  `CourseSummary.effort` as of #3 (2026-08-30), so the conversion
  `T_B = T_A × E_B / E_A` needs no new computation and no longer waits on #5.
  `gapPaceFromGoalTime`/`goalTimeFromGapPace` in
  [src/lib/pacing/effort.ts](src/lib/pacing/effort.ts) are the same conversion
  in one direction each. Optionally layer the
  weather model on top later ("...and 3:11 in Berlin's typical September
  conditions"), which no competitor can do — but ship the geometry-only version first.
- A new route, `src/app/compare/page.tsx`, plus its nav entry from #6.
- Two course pickers: [CourseSearch.tsx](src/components/CourseSearch.tsx) is already
  a standalone ARIA combobox and should be reused as-is, twice.
- Shareable via query params, following the existing `src/lib/resultsParams.ts`
  pattern. Add the route to the sitemap.
- Most of the cost here is UI and page design, not math.

**Shipped as planned.** `/compare` takes two courses and a finish time and
answers with the equal-effort time at the other race. It originally also
converted that time across the whole catalog in a sortable, filterable table
(`EquivalentTimeTable`, plus the CTA and Copy link that followed it) — the
pair conversion was cheap enough that the catalog view came almost free on
top of it. **Removed 2026-09-17** at product direction to keep the page to
the single-pair result; the component and its test were deleted rather than
left dead in the tree.

`equivalentGoalTime` in [effort.ts](src/lib/pacing/effort.ts) is the whole of
the new math: the two existing conversions run back to back. Rule 1 sign-off
was given for it as a purely additive export.

**Five things worth recording:**

1. **The conversion is pinned to the km segmentation, and the km/mi toggle is
   display-only.** Following the display unit would have let flipping to miles
   move the answer by up to 0.43% (minutes, on Pikes Peak) with no explanation
   on screen. `effortMultiplier` had already made the same call for the same
   reason; this now matches it.
2. **That forced `sharedGapPace`.** The page claims both finishes are run at
   the *same* grade-adjusted pace, and in mile mode the obvious
   `gapPaceFromGoalTime(…, "miles")` quietly makes that false, because the
   conversion is defined on km. GAP is one physical quantity — seconds per
   flat-equivalent kilometre — so the mile figure is a **unit conversion of the
   km one**, never a re-segmentation. Pinned by a test asserting the two are
   *not* interchangeable.
3. **The two directions are not additively symmetric.** Boston → Berlin is
   +1:10; Berlin → Boston is −1:09. It is a ratio, so each direction takes its
   percentage off a different base. The round trip is still exact. A component
   test caught this and now documents it, because it looks like an off-by-one
   and is not.
4. **`parseCompareParams` has no failure case**, unlike `parseResultsParams`.
   /results cannot render without a course; /compare renders two empty pickers,
   which is its legitimate resting state — so a junk param degrades to a
   default instead of replacing a usable page with an error.
5. **The nav is at its budget.** Four links needed `gap-6 lg:gap-8` to stay on
   one line at `sm`. The height invariant from #6 is untouched (links are still
   20px of line box); a fifth tool needs a different answer, not a smaller gap.

**Two small refactors came with it:** `formatVsFlat` moved out of
`CourseRankingTable` into [src/lib/units/effort.ts](src/lib/units/effort.ts) so
/compare could use it without pulling the ranking table into its bundle (the
same move #5 made for `metresToFeet`), and `formatSignedHMS` joined
`src/lib/units/time.ts` — a signed delta that drops a zero hour, since
"0:05:22" reads as a duration rather than a difference. Both still hold after
the catalog table's removal: `formatVsFlat` prints in `CourseStat` and
`formatSignedHMS` prints the single result delta.

**Deliberately not done:** the weather layer, exactly as this section says to
defer it. The page states plainly that it converts terrain only.

---

# Phase 3 — new data or new architecture

## 9. [~] Boston qualifier standards + per-race BQ status

**Status:** 9a + 9b done 2026-09-04 · 9c still blocked · **Ease:** ●●●●○

Shipped as `/boston-qualifier` plus a verdict strip on the results page, over one
pure module in [src/lib/bq/](src/lib/bq/). **The results-page strip was removed
on 2026-09-20** during a design pass on that header: everything else there
describes a race and a plan for running it, and the BQ verdict was the one row
judging the runner instead, with no bearing on the chart under it. The page, the
standards, the cut-offs and the net-downhill index are all untouched and still
reachable at `/boston-qualifier`; only the second surface went. If it comes back,
it needs a reason that is about the results page, not about the feature. **No schema change, no migration, no
seed field, no `resultsParams` change** — which is not what the plan assumed, and
the reason why is the main finding here.

**9b turned out to be free, and that reshaped the project.** The plan costed 9b
as "one boolean column plus human research across 326 races". Research during
planning found that the per-race BQ fact that actually matters is not
certification but the B.A.A.'s **net-downhill time index**, new for the 2027 race:
a qualifying time run on a course with a big net drop has time *added to it*
before it is compared against the standard — +5:00 from 1,500 ft, +10:00 from
3,000 ft, ineligible from 6,000 ft. And that is computable from data already in
hand:

- `courseTerrain().netM` is finish minus start, and
  [terrain.ts](src/lib/pacing/terrain.ts) is explicit that this one figure is
  **exact at any resolution**, unlike `gainM`/`lossM`. It is precisely the
  quantity the rule uses.
- `CourseSummary.terrain` already ships to the client for all 326 courses, so the
  index needed no query, no column and no research.

Measured across the catalog: **2 courses at +10:00** (Eker I Run −5,462 ft, REVEL
Mt Charleston −5,056 ft), **6 at +5:00** (St. George −2,491, N4 Elands −1,631,
Estes Park −1,574, Mendoza −1,549, Utah Valley −1,526, Bhutan International
−1,517), **none ineligible**. FindMyMarathon publishes the rule but ties it to no
race; nobody does.

**The cut-off is part of the product, not a footnote.** Meeting the standard only
buys the right to apply — Boston turned away 8,887 qualified applicants for 2026.
`BQ_CUTOFFS` carries what acceptance really required, 2012–2026, and the verdict
reports a count across recent years rather than a prediction, because the cut-off
turns on application volume nobody knows in advance.

**Three things worth knowing before touching this again**

1. **The index is an estimate and the UI must keep saying so.** Three courses sit
   within ~110 ft of the 1,500 ft line (Utah Valley −1,526, Bhutan −1,517,
   Deseret News −1,420 just under), which is well inside the error of a digitized
   route. `nearThreshold` flags them rather than calling them.
2. **~~Known data gap~~ — corrected 2026-09-25 (#23): the "near 2,000 ft"
   figure was wrong.** Our geometry reads −856 ft and its source GPX reads
   −859 ft. The organizer's own published profile is 267 ft of gain and 1,300 ft
   of loss, a net of about **−1,033 ft**. So we under-read the drop by roughly
   17%, not by half, and the source route is not "wrong" — it is a rail trail
   whose GPS noise inflates gain and loss together. It still sits below the
   −1,500 ft line and is still indexed at zero, which is the right call at
   −1,033 ft. Do not go hunting for a 2,000 ft drop; it does not exist.
3. **A time equal to the standard qualifies.** The comparison is `<=`, not `<`,
   and `qualify.test.ts` pins it. An off-by-one there tells someone who ran
   precisely 3:05:00 that they missed.

**The certification boolean is deferred, deliberately.** `bq_certified` on
`event_series` is still the only way to say "this race is a legitimate
qualifier", and it still costs human research across 326 races with no bulk
source. It was left out because the downhill index delivers the per-race value at
zero cost, and a mostly-null column is a permanent schema commitment for little
payoff. If it is picked up: USATF/AIMS certification is checkable per race, the
sign-off pattern to copy is `data/import/decisions.json` + `qa.ts`, and a
separate `data/bq/certifications.json` fits better than bolting it onto
`StagedCourse` — the 326 seeded series would never pass back through `qa.ts`.

**9c — qualifier statistics: still blocked, and now for a recorded reason.** "How
many people BQ'd here" needs results data. RunSignup's API is Apache-licensed but
that licence covers **the interface, not the content** — their content stays
under the normal service agreement; Athlinks publishes an API with no bulk reuse
grant either. Commercial reuse would need a direct agreement with each platform.
That is the same unsettled-rights problem CLAUDE.md already flags for course
data, and pacebands are paid product. **Do not start without settling that
first** — the blocker is legal, not technical.

## 10. [x] Bring your own course — GPX / KML / Strava upload

**Status:** Done 2026-09-04 · **Ease:** ●●●●● · **Hardest by far**

**Design document: [docs/UPLOADED-COURSES.md](docs/UPLOADED-COURSES.md)** — written
first, as this section asked for, because this is the project that decides
something against Rule 6.

**What shipped, and the four things that differed from the plan**

1. **All three storage options were the wrong question.** The plan weighed
   ephemeral state, a `user_course` table and URL-encoded geometry as if the hard
   part were where to put the bytes. The actual insight is that
   `COURSE_SLUG_RE` — `/^[a-z0-9][a-z0-9-]{0,63}$/` — already matches a token
   shaped `u-<22 chars>`. So the results URL, `buildResultsQuery`,
   `parseResultsParams` and the entire checkout ladder needed **no change at
   all**; exactly one function, `getCourseBySlug`, learned one branch, and it was
   already the single existence proof both `/results` and `/api/checkout` share.
   The table was still the right choice — it just stopped being an architectural
   fork and became a storage detail.
2. **The port is byte-identical, and that was not free.** `resample.ts`
   reproduces `parse_gpx.py` exactly, verified across **all 326 seeded courses**
   with zero mismatches. The hazard nobody would have predicted: Python's
   `round()` is half-to-**even**, JS `toFixed` is half-**away-from-zero**, and
   they diverge on values like `66.25` that a smoothed elevation really does
   produce. `roundHalfEven()` exists for that. `conformance.test.ts` pins twelve
   courses chosen for the failure modes they expose, so the two implementations
   cannot drift.
3. **Rule 8 answered the paceband question itself.** Ordering clears
   `expires_at` *before* the Stripe session exists — paying is what makes a
   course permanent, which is the only way an expiring id and a printed link can
   coexist. `makeUserCoursePermanent` throws rather than swallowing, uniquely
   among this app's runtime writes: if the link cannot be promised, the order
   fails instead. An abandoned checkout leaving a course permanent for free is
   the accepted cost, bounded by the rate limit.
4. **The DEM stage had to be re-cut for a live request.** The import pipeline's
   full-track lookup is ~30 s; the upload route samples a ~100 m-decimated track
   (~4 s) and interpolates back. Sampling density was never the limiting error —
   reading the ground instead of the road is, and bridges dominate it.

**Also worth recording:** `scripts/import/route.ts`, `dem.ts` and the library
half of `elevate.ts` moved to `src/lib/course/` so the app can reach them without
Next bundling `scripts/`; thin re-export shims mean no import script or its tests
changed. Uploads never enter the catalog — not the picker, the map, `/courses` or
`/compare` — and an uploaded course is never indexed. Rate limiting is the app's
first (10/hour, keyed on a salted IP hash), and that hash is a stated departure
from `weather_window`'s "carries nothing about who asked", disclosed in `/terms`.

**Deliberately not done:** Strava OAuth. Strava exports routes as GPX and those
files are accepted; an API integration needs the accounts Rule 6 refuses.

<details>
<summary>The original plan, kept for the record</summary>

Flagged as Phase 2 in CLAUDE.md since before the database existed. ultraPacer,
Garmin and Stryd all accept an uploaded course.

**The parsing is the easy part; storage is the hard part.**

- **Parsing — mostly already built.** `scripts/import/route.ts` already normalizes
  `<rte>` exports, KML/KMZ and GeoJSON into single-track GPX, and
  `scripts/import/elevate.ts` already fills missing elevation from a DEM (tagged
  `dem:<dataset>`, never confused with surveyed elevation). Both are Node and could
  be lifted behind a server route. The 44-point resampler is
  `scripts/gpx_parser/parse_gpx.py` — **Python, and Rule 7 says app code is
  TypeScript**. Either port the resampler to TS (the honest option) or accept a
  Python runtime on the server (a real deployment change on Vercel). This decision
  needs to be made before any code is written.
- **Storage — the actual blocker.** Courses are database rows with permanent slugs
  (Rule 8), and there is no auth and no user-owned data (Rule 6). An uploaded course
  has nowhere to live. The options, none free:
  1. Ephemeral in-session only — but that breaks the shareable `/results` URL, which
     is a core property of the product, and breaks the checkout flow, which
     validates `courseId` against the database ("no course, no charge").
  2. A `user_course` table keyed by a random token — workable, keeps links
     shareable, but it is user-generated content in a database that has been
     public-read-only by design, and it needs size limits, rate limiting and an
     abuse story.
  3. Encode the geometry in the URL — too large for 44 points plus coordinates.
- **Also needs:** upload UI, file size/type validation, a distance sanity check
  (the parser's existing [41.5, 43.6] km window and the reasons it was widened
  twice), and a decision on whether an uploaded course can be ordered as a physical
  paceband at all.

**Recommendation:** do not start this until 1–8 are done. It is the one project that
forces a decision against Rule 6, and it deserves its own design document first.

</details>

---

## 11. [x] Stop the calculator driving the address bar

**Status:** Done 2026-09-17 · **Ease:** ●●○○○

Every edit on `/results` was written back into the URL by a 300 ms debounced
`router.replace` in `Dashboard.tsx`, and `/compare` did the same with
`window.history.replaceState`. Changing a goal time, a unit or a split strategy
churned the address bar continuously. Mainstream calculators do not do this
(McMillan's stays at `/dashboard/` however much you edit), and it made sharing an
accident of the URL rather than a thing anyone chose.

**What shipped**

- Both write-backs deleted. The URL is now **read on arrival and never written**.
  Nothing about the *inbound* contract moved: `resultsParams.ts`,
  `compareParams.ts`, `results/page.tsx`'s parsing, `lib/orders.ts` and
  `/api/checkout` are untouched, so every calendar link, ranking link and paid
  paceband `resultsUrl` still resolves exactly as before. Order queries were
  already built from `result.input` rather than the address bar, so the
  fulfillment record in Stripe metadata (docs/FULFILLMENT.md) is unaffected.
- **`/api/courses/[slug]`** is new, and is the part that was not obvious. The URL
  write was not a mirror of state: it was the course-switching mechanism, because
  new geometry only reached the browser when `router.replace` re-ran the server
  component. `Dashboard` now fetches the geometry itself, one course at a time,
  memoised per dashboard so flipping between two races costs one request each. It
  wraps `getCourseBySlug`, so uploaded `u-` courses work without a second branch.
- **`CopyLinkButton`** (shared by both pages) replaces the address bar as the way
  to share: it serializes the current state through the same builders on press.
  New funnel event `copy_link_clicked`, registered in both `lib/analytics.ts` and
  `api/event/route.ts`.
- **`Dashboard.test.tsx` is new.** There was no test for this component at all,
  which is why the URL/geometry coupling was easy to miss. It now covers the
  no-URL-writes guarantee, the fetch-on-switch path, the cache, out-of-order
  responses and the failure path.

**Turned out differently from the plan:** the failure path needed a visible
**Try again** button. Re-picking the same course does not change the wanted id, so
a failed fetch would otherwise have been unrecoverable without a reload.

## 12. [x] Course cost model — fix the race-time conversion

**Status:** Done 2026-09-18 · **Ease:** ●●●○○

`/compare` converted a 4:00:00 Boston into 4:01:06 at New York. FindMyMarathon
says 4:03:20. The gap was not a tuning error, it was two structural faults, and
the first investigation (damping) found only part of it.

**What was wrong**

`equivalentGoalTime` divided two `CourseEffort` figures, and `CourseEffort` is
built from `adjustmentFactor` — the pacing engine's curve, damped to k = 0.35 and
applied EQUALLY to climbs and descents. That curve was calibrated in May against
published pace BANDS (see `PACE_BAND_PROBLEM_REPORT.md`) and is right for that
job; `fmm.boston.regression.test.ts` still pins it to ±11 s. It was never right
for comparing two courses:

- **Symmetry.** Minetti's cost curve is close to symmetric at road grades, so
  climbing and descending nearly cancel and a rolling course reduces to almost
  exactly its flat distance. 292 of 326 seeded courses landed inside the ±0.5%
  band `formatVsFlat` refuses to quote. Big Sur read 0.3% **faster** than flat.
  Blue Ridge, measured at 3,371 ft of climbing and marketed as America's toughest
  road marathon, read 0.6% harder.
- **Altitude was computed and then not used.** `courseAltitude` has shipped since
  #7 and `totalEffortMultiplier` already multiplied it in for DISPLAY, but the
  conversion math read geometry alone. A mile-high course converted as though it
  were at sea level.

Measured against 44 published FindMyMarathon Course Scores, R² of the shipped
model was **0.017**. Retuning the damping constant cannot fix that: the best any
symmetric curve reaches is 0.027, because the defect is the shape, not the scale.

| model | R² | RMS on a 4:00:00 conversion |
|---|---|---|
| shipped (k = 0.35, symmetric, no altitude) | 0.017 | 275 s |
| any symmetric k, no altitude | 0.027 | 273 s |
| symmetric + altitude | 0.381 | 218 s |
| asymmetric, no altitude | 0.667 | 160 s |
| **asymmetric + altitude (shipped)** | **0.925** | **76 s** |

Both halves are needed and neither alone is enough.

**What shipped**

- **`src/lib/pacing/courseCost.ts`** — a SECOND grade-response curve,
  `clamp(1 + k(g)·(C_r(g)/C_r(0) − 1), 0.6, 2.5)` with `k_up = 1.95` and
  `k_down = 0.80`, fitted to the 44 Course Scores. `adjustment.ts`, `minetti.ts`,
  `normalize.ts`, `index.ts` and `segments.ts` are untouched, so **no pace band,
  no split, no paceband PDF and no shared `/results` link moves.** That
  separation is the whole design: two questions, two curves, two external
  references, two regression tests.
- **`CourseCost` on `CourseSummary`**, beside `CourseEffort` rather than
  replacing it. `effort` still inverts the engine exactly, which is what makes a
  GAP goal round-trip; `cost` is what /compare and /courses read. Catalog cache
  key bumped to `course-catalog-v3`.
- **Altitude folded into the conversion** via `totalCostKm`, the one place grade
  cost and air cost are combined. `totalEffortMultiplier` is now that number over
  the marathon distance, so the figure the ranking table prints and the figure
  the conversion divides are provably the same one.
- **`equalEffortPace`** replaces the engine's GAP on /compare, and the label
  changed from "Grade-adjusted pace" to "Equal-effort pace" because the number
  now includes altitude and the old name would have been a lie on a mountain
  course. It is the invariant the conversion holds fixed, so the page's claim is
  now literally true rather than nearly true.
- **`fmm.courseScore.regression.test.ts`** — the calibration set committed as a
  test, the sibling of the Boston band pin. The fit itself is circular (the
  coefficients came from this data), so what the test actually guards is that the
  asymmetry and the altitude term cannot be quietly removed: both are asserted
  against the alternatives they beat. Plus face-validity cases on courses runners
  have opinions about.

**Effect.** Boston 4:00:00 → New York now reads **4:02:30** against FMM's
4:03:20, up from 4:01:06. Blue Ridge went from +170 s to +1,672 s (FMM: +1,472
s). The catalog spans 0.875 (Eker I Run) to 1.682 (Pikes Peak) where it used to
span 0.936 to 1.071, and 92 of 326 courses sit in the flat-equivalent band
instead of 292.

**Turned out differently from the plan**

- **The 44 reference courses were QA'd against FMM's own published gain/loss
  before being admitted**, and all 44 agree on net elevation change. Worth doing:
  the compare tool fuzzy-matches names and a silent mismatch would have poisoned
  the fit.
- **The altitude exponent was left free in the fit and came back at exactly 1.0**,
  which is an independent external check on the Wehrlin & Hallen model from #7
  rather than a number anyone tuned.
- **Deriving cost from `*.profile.json` instead of the 44-point array was
  measured and deferred.** Resampling the dense profile at 500 m and refitting
  gives R² 0.935 against 0.925 and RMS 71 s against 76 s: real, but small, and it
  costs a schema column, a migration, a seed-time precompute and a stored derived
  value that can go stale against the code. The catalog query deliberately does
  not select `profile` (7-48 KB per row against 326 rows). Recorded below rather
  than half-built.


---



# Phase 4 — new reads of data we already hold

No schema change, no new source data, no new human research. Everything here is
computed from the 44-point elevation arrays, the existing catalog scalars, and the
per-segment multipliers the engine already builds and then throws away.

## 13. [x] Hill segments — name the climbs that matter

**Status:** Done 2026-09-20 · **Ease:** ●●○○○

A panel that names a course's few significant climbs, the way a runner talks about
a course: Newton, not "twelve rises". Explicitly **not** an exhaustive list — the
feature fails the moment it prints fifty segments, and it must print none at all on
a flat course rather than manufacturing three.

**What it entails**

- A new pure module, `src/lib/pacing/hills.ts`. Rule 1 sign-off needed as a purely
additive export, on the same footing `terrain.ts`, `altitude.ts` and
`courseCost.ts` were added: it reads the elevation array and touches nothing the
Minetti curve owns.
- **Detection.** Walk the 44-point array accumulating rising runs with hysteresis,
so a single flat or slightly falling kilometre inside a long climb does not split
one hill into two. Then score each candidate and keep only the significant ones.
- **Score it in seconds, not metres.** The honest significance measure is what the
climb costs: run the run's segments through `courseCostFactor` and difference
against flat. That is also the number worth printing on the card, it sorts
correctly across courses of different lengths and steepness, and it means a long
shallow drag and a short wall can be compared at all. Metres of gain alone would
rank a 200 m climb spread over 8 km above Heartbreak.
- **Thresholds are fitted, not chosen** — same discipline as #5's profile bands.
Run the detector over all 326 course files, look at the distribution
of counts, and set the floors so the median course shows 0-3 cards and the
hilliest shows a handful. Candidate knobs: minimum gain, minimum average grade,
minimum length, maximum internal dip, and a relative floor that drops any climb
far smaller than the biggest on that course. **No hard cap of 5** — the cap is the
wrong mechanism, because it would truncate a genuinely lumpy course and pad
nothing on a flat one. Pin the resulting catalog-wide distribution in a test the
way `terrain.test.ts` pins the profile split, so no floor can move quietly.

**The resolution decision, which has to be made first**

The 44-point array samples once per kilometre. Heartbreak Hill is about 600 m long,
so it cannot appear as its own object at that resolution — it will land inside a
longer Newton-hills run. The dense `profile` array has the resolution, but #5 found
that gain re-derived from it is a **worse** predictor than the 44-point figure
(r = 0.819 against 0.902) because raw trace noise scales with the recording device,
and `profile` is not in the catalog query.

**Recommendation: the 44-point array.** It keeps the hill panel consistent with the
profile badge and the "vs flat" figure beside it, it is available wherever course
geometry already is, and it works for uploaded `u-` courses for free. Say plainly on
screen that the segments are kilometre-resolution. If a later pass wants sub-km
walls, that is the dense-profile project in "Explicitly deferred", not this one.

**Known limitation to record, not to fix here:** several source GPX files badly
under-record climbing (§12 — New York retains 293 ft of gain against
FindMyMarathon's surveyed 966 ft, because the bridge climbs are smoothed away
before the parser sees them). A hill panel is the first surface that makes that
visible to a runner: New York will show fewer and smaller climbs than the race
actually has. Ship it with that known, and fix it by re-sourcing GPX (#23), not by
tuning the detector to compensate.

**UI.** Two sections on `/results`, stacked under the summary strip in this order:
the elevation profile, then **Race splits**, then **Hill segments**, then the splits
table. Hill segments is the plan's panel: a row of narrow cards to flip through,
one per climb, numbered 1, 2, 3 in course order, each a short stack of lines
(distance range to one decimal, length, gain, average grade, and the plan's average
pace over the stretch, taken from the same cumulative splits the table prints and
never recomputed from the model, or the panel and the splits table will disagree).
A lone climb is one card at its own width, not a
full-width slab; previous and next buttons appear only once the cards overflow.
Neutral surface and border tokens; a climb is not a verdict and does not need the
profile colour ramp. Neither section is collapsible. Race splits is the chart
described in the notes below, and it is a separate section on purpose: it is about
the whole race, and the cards are about the few climbs in it.

**Tests:** distribution over all 326 files, offline, the way `altitude.test.ts`
walks the disk rather than the seven-course fixture; a flat course returns an empty
array; a known hilly course returns the climbs a runner would name; merging across
an internal dip; segments never overlap and come back in course order.

**What differed from the plan, recorded as shipped:**

- **The score is a distance, not a duration.** `HillSegment.excessKm` is excess
  flat-equivalent kilometres and `hillCostSeconds(hill, flatPaceSecPerKm)` turns it
  into seconds at the edge, so the detected climbs are identical for every runner
  on a course and only the seconds beside them move with the goal.
- **The floor is on NET RISE, not total gain.** Net rise is the figure the card
  prints, so the threshold and the display are the same number. Field is `riseM`.
- **The cost floor turned out non-binding.** Nothing clearing the rise and density
  floors fails `HILL_MIN_COST_SECONDS` on today's catalog (the cheapest surviving
  climb costs 57.6 s against a 50 s floor). Kept as a guard against a future course
  of many tiny steep steps, not as a working threshold.
- **An average-grade floor was tried and rejected.** It is strictly contained by
  the cost-density floor: averaging grade across an internal dip cancels real
  climbing while integrating cost does not, so it discards rolling drags that
  genuinely cost time (Atlanta km 13-26, 0.32%, 11 s/km). Density keeps them and
  still rejects Tokyo km 24-42 (19 m of rise, 0.11%, 4.4 s/km).
- **The dip tolerance is capped at 2 segments** (`HILL_MAX_DIP_SEGMENTS`) as well
  as in metres. Depth alone let a multi-kilometre sag swallow a real 26 m climb on
  `koenig-ludwig-marathon`. Boston, Big Sur and New York are unchanged by the cap.
- **Measured result as shipped:** 0 climbs on 140 of 326 courses, median 1, max 6,
  pinned by `hills.test.ts`. Average climbs per profile band rises monotonically
  across the independently fitted bands: Very Flat 0.00, Mostly Flat 0.26, Rolling
  1.57, Hilly 2.59, Very Hilly 3.00 (Downhill 0.64). Every Very Flat course is
  empty; no Hilly or Very Hilly course is.
- **No invented names.** "Newton" cannot be derived from geometry, so cards are
  identified by distance range. Real names need a hand-maintained column, which is
  its own project and not this one.
- **`rowRangeForDistanceRange` had to be added** to `src/lib/chart/geometry.ts`:
  the existing `rowIndexForDistance` is half-open, so feeding it a climb's end
  returned one row too far on nearly every course. The panel reads its paces
  through the new helper.
- **Sub-kilometre walls remain out of reach**, as the resolution decision predicted:
  Heartbreak Hill lands inside the longer Newton run and the panel says the
  measurement is kilometre-by-kilometre out loud. That is the deferred
  dense-profile project, still deferred.
- **A second section, Race splits, which the plan did not call for.** Cards alone
  did not let a runner see the shape of the race, so `RaceSplitsChart` draws one bar
  per split row (the same increments as the splits table, in the runner's own unit)
  showing what that kilometre costs against flat ground, with the named climbs
  shaded behind the bars. Hovering a column names the row and its seconds against
  flat in a pill styled after the elevation chart's. `costProfile(elevations, unit)`
  is the new export that feeds it, and `hills.test.ts` pins the property that makes
  the chart and the cards one claim rather than two: the bars under a band sum
  exactly to the cost that band's climb adds. (The cards used to print that cost as
  "vs flat"; see the revision note below.)
- **Hill segments carries no summary strip and no explanatory copy, by decision on
  2026-09-21.** The plan's low / high / gain / loss / climbs strip is gone (the
  profile badge and the elevation chart already carry the first four), and so is the
  note explaining "costs vs flat". **That removes the on-screen statement the
  resolution decision above asked for** ("say plainly on screen that the segments
  are kilometre-resolution"): the only place it survives is Race splits' "Per
  kilometre" subtitle, so a short wall such as Heartbreak sitting inside its longer
  climb is no longer explained anywhere a runner can read. Recorded here so it is a
  known gap and not a rediscovered one.
- **Second revision of the cards, 2026-09-21.** Each card is numbered in course
  order (a neutral filled badge: it names a card, it does not grade one); positions
  always carry one decimal ("Km 27.0 to 34.0", finish "42.2"); "rise" is now
  "elevation gain"; the "vs flat" cost line is gone; and the fastest-to-slowest pace span is
  replaced by one average pace. **"Gain" is still the net top-minus-foot figure**,
  the one the detector filters on, so a climb with a dip inside it reads slightly
  under the sum of its uphill kilometres. The average is elapsed plan time over
  distance from `cumulativeSplitSeconds` (`averagePaceOverRows`), which counts the
  0.195 km finish row at its real length, and it matches the splits table by
  construction (checked against the rendered table for Boston: 2422 s over 7 km is
  5:46 /km on both). **`hillCostSeconds` now has no caller in the app**; it stays
  as a tested pure export because per-climb cost is what a future per-factor
  breakdown (#16) would want, but it is dead weight until then.
- **Switching courses left the row scrolled.** React reused the scroller node, so a
  course opened wherever the previous one was left: Lisbon at its last card, then
  Kansas City opened on its fourth of five. The row is now keyed on the climbs
  themselves, so a new course starts at climb 1 while a km/mi flip or a goal-time
  edit (which change no climbs) keeps the runner's place. Found by driving Chrome;
  jsdom has no scrolling to get wrong.
- **Cards are a snap-scrolling row, and carry no difficulty badge.** The reference
  design had a numbered badge per card; there is no per-climb score on a scale a
  runner could read, and a number invented to fill the slot would be worse than an
  empty one. Not built. If a real score is ever defined, it belongs on the card.
- **A grid item will not shrink below its content by default.** The first version
  of the row stretched the whole results column to 1,500px on a six-climb course
  (`lisbon-eco-marathon`) and scrolled the page sideways. The Dashboard's results
  column now carries `min-w-0`, and `Dashboard.test.tsx` holds it. Nothing in jsdom
  could have caught this.
- **Flat courses keep both sections.** Hill segments says so in one sentence and
  Race splits sits directly above it with the bars lying on the zero line: that is
  the evidence for "this course is flat", where the sentence alone was only a claim.
  The ±10s axis floor exists for the same reason, and is what stops a flat course
  being drawn as a mountain range.
- **Placement changed twice on the way in, and ended where the plan started.** The
  plan said under the elevation chart; it was first built above it; it now sits
  below both the elevation profile and Race splits, so the ground, the ground as
  seconds, and the few places it matters read in that order. Hill segments was also
  briefly a collapsible panel and is not any more: with the chart split out, what
  was left was short enough that hiding it only cost a click.
- **New York's under-recorded bridge climbs were NOT compensated for.** It shows
  fewer and smaller climbs than the race has, which is the #12/#23 source-data
  limitation becoming visible to runners exactly as planned. The fix is re-sourcing
  the geometry, never tuning the detector.

## 14. [x] Race-day weather panel on the results page

**Status:** Done 2026-09-23 · **Ease:** ●●○○○

Show the conditions the plan is actually built on: the summary (temperature, wind,
humidity, cloud, apparent temperature) and the hour-by-hour progression through the
race, with each hour tied to where the runner will be at that point.

**This is almost entirely a display project, and that is the finding.** The data is
already fetched, already hourly, already interpolated, and already thrown away:

- `/api/weather` returns `{ hours, source, meta, cached }` and names its source as
`forecast`, `historical` or `typical`.
- `usePacingChart` builds `series` (live hourly or `synthesizeHourly`) and computes
`segmentConditions` — **the conditions at the moment the runner passes each
segment's midpoint** — then uses them for the multipliers and discards them.

So "11:00 AM · 14.1 km · 12 °C" is a row the app can already construct exactly; the
work is to surface `segmentConditions` (or a resampled hourly view of it) on
`PacingResult` instead of letting it fall out of scope. Do that once, because #17
needs the same per-segment array.

**What it entails**

- Carry the per-segment conditions out of `usePacingChart` on `PacingResult`.
Resample to clock hours for the timeline, since the runner reads a time of day,
not a segment index. Rows: pre-race hour, start, each hour with the distance
reached, and finish.
- **Label the source, always.** The panel must say whether it is a forecast, what
was actually recorded on a past race day, or a ten-year typical for that date.
`WeatherSource` already carries it and the route already returns it. A climatology
average presented as a forecast is the one way this feature can mislead someone.
- **Two fields in the screenshot we do not currently fetch: cloud cover and WBGT.**
Cloud cover is one more Open-Meteo/Tomorrow.io variable and is cosmetic. WBGT is
not — it is a different heat index from the NWS one `heat.ts` uses, and printing
a WBGT next to a slowdown derived from a heat index invites the reader to
reconcile two numbers that are not the same claim. **Recommendation: skip WBGT**,
and show the apparent temperature `heatIndexC()` already computes, which is the
number the plan is actually built on. If WBGT is wanted later it is §4b, a model
change with its own justification.
- Wind gets a bearing arrow. The per-segment relative wind is already computed in
`wind.ts`, so "headwind from 24 km" is available and is more useful than a
compass direction, but it is a second step: ship the absolute conditions first.

**Tests:** the hourly resample lands the right distance against the right clock
hour, including when the race crosses noon and when it finishes mid-hour; each of
the three sources renders its own label; the panel is absent, not empty, when the
runner has weather switched off.

**What turned out differently**

Shipped as **Weather Forecast** (`src/components/WeatherTimeline.tsx`), between the
elevation profile and the impact breakdown, with the row layout above plus a sky
glyph and a chance-of-rain column. Six things the plan above did not anticipate:

- **"Label the source, always" was resolved by not showing the other two sources
at all.** The section is titled "Weather Forecast", and a heading is not something
a reader checks against a caption underneath it, so `historical` and `typical` now
remove the section rather than retitling it. Per-source headings were built first
("Race Day Weather" / "Typical Race Day Weather") and rejected in favour of the
narrower rule. **The cost is real and was accepted knowingly: on most visits this
section will not exist**, because most runners look at a race months out and get a
climatology. The route still returns and caches all three sources, and
`WeatherFields` in the sidebar still names whichever one answered, so nothing was
lost from the pacing engine or from the fetch — only from this panel. If it is
ever widened again, `rainText` is the first thing that has to grow back its
per-source branches.

- **"Almost entirely a display project" was right about the data and wrong about
the sampling.** `selectHourlyWindow` picks the provider entry NEAREST the gun and
everything downstream treats it as t=0, so `hours[i]` is only "gun plus i hours" to
within half an hour. The engine can carry that smear; a panel printing "11:00 AM"
beside a temperature cannot. `timeline.ts` recovers the provider's hour grid by
rounding the gun to the nearest hour, so a whole-hour zone reads the provider's own
11:00 value exactly and a half-hour zone (Kolkata, St John's) interpolates between
two real readings. `conditionsAtElapsed` is deliberately NOT used: it clamps, which
would have made the pre-race row a silent copy of the start row.
- **The rain threshold is 0.1 mm, not 0.** ERA5 and the operational model emit
0.01 to 0.05 mm of drizzle on mornings a person outside would call dry. Testing
`precipitation > 0` would have reported rain on most race days and given every
ten-year climatology a chance of rain. `PRECIP_TRACE_MM` in `history.ts`.
- **Precipitation is one stored number making three different claims.** The panel
branched on source at first ("40% chance" / "Rain" / "40% of the last 10 years");
once it became forecast-only, only the probability wording survived in the
component. The DATA still carries all three meanings and `WeatherConditions`
documents them, because the route caches all three sources. The climatology falls
out of the same averaging as everything else, since the arithmetic mean of a set of
0/100 values IS the share of years with rain.
- **The cache needed a version column**, not just new fields. `historical` rows
never expire, so every previously-visited past race would have been served forever
without cloud cover or a lead hour. `WINDOW_VERSION` in `weatherCache.ts` plus
migration `0006`; old rows are invisible, re-fetched once and overwritten in place.
Sniffing for a missing field was rejected: a provider that legitimately reported no
cloud is indistinguishable from a stale row that way, so such a key would miss on
every request forever and re-buy the same metered answer.
- **`segmentConditions` was NOT carried on `PacingResult`.** The note above says to
do it once because #17 needs it, but #17 shipped first and reads the multipliers
instead, so publishing that array would have added a field nothing reads. The
timeline reads `hourlySeries` (the exact series the multipliers were sampled from),
which is what it wanted anyway. If a later project genuinely needs the per-segment
view, it is three lines inside `calculate`.

Two smaller ones: the archive request now starts a day EARLIER than race day, or a
race starting between 00:00 and 00:59 UTC has no pre-race hour inside its own
calendar day; and the panel hides itself when the fetched data's `key` disagrees
with the course being charted, because `useWeather` does not clear its series on a
course switch. That staleness is still there on the pacing path and was left alone
deliberately: fixing it would move published splits.

Manual mode shows no timeline, by decision, and that decision generalised: the
section now requires a live forecast. Manual entry has no sky and no rain and its
hourly progression is a synthesized fall-morning assumption, so drawing it as a
timeline of clock hours would dress an assumption up as an observation. The same
objection turned out to apply, more quietly, to a ten-year average under a heading
that says "Forecast".

**One palette rule was reopened for this.** The precipitation glyph's falling
strokes are `--color-blue-primary`, the third and last exception to the
red/white/black palette (CLAUDE.md Rule 2, argued in DESIGN.md). Rain is the only
quantity on this site that readers arrive already holding a colour for, and red and
green are both semantic here so neither could be borrowed. It is fenced to one
component by `src/theme.guard.test.ts`, the way green was.

## 15. [x] Course elevation profile in the ranking table

**Status:** **Done** 2026-09-20 · **Ease:** ●●○○○

Replace the word in `/courses`' Terrain column with the shape itself: a small,
non-interactive elevation sparkline per row.

**The obstacle is the payload, not the drawing.** `/courses` renders from
`CourseSummary`, which carries **no geometry at all** — only the terrain, cost,
effort and altitude scalars. Its stated contract is "~200 bytes each", and that is
what lets the whole 326-course catalog ship to the client. Three ways out, in the
order they should be considered:

1. **Render the path server-side.** `/courses` is a server component reading the
  catalog; if the sparkline's `d` attribute is generated on the server and put
   straight into the row markup, no numbers cross the wire at all and
   `CourseSummary` is untouched. Cheapest and most likely correct. Check first
   whether the ranking table's client-side sorting forces the rows to be client
   components — if it does, the paths still serialize fine as strings.
2. A compact quantized profile on `CourseSummary` (44 values scaled 0-100 of the
  course's own span). Measure it before committing: roughly 130-180 bytes per
   course, which about doubles the type's budget, and it bumps the catalog cache
   key to `course-catalog-v4`.
3. A separate payload fetched only by `/courses`, so the homepage catalog is
  unaffected. The fallback if 1 is blocked and 2 measures badly.

**The one real design call: shared vertical scale or per-course.** Per-course
scaling makes every row fill its box, which makes shapes comparable and magnitudes
meaningless — Berlin would look like a mountain range. Use a **shared scale with a
floor**, the same move `ElevationChart` makes with `MIN_SPAN_FT = 600`, so a flat
course reads flat and a mountain course runs off the top of the band. Otherwise the
column lies about the flattest 118 courses in the catalog.

**Keep the profile label.** *(Reversed at ship: the column is the line alone, see the
notes below.)* The sparkline sits beside `DifficultyBadge`, it does not
replace it: the word is what a reader scans and the shape is what they check.
Explicitly non-interactive, per the request — no hover line, no tooltip. The
existing hover chart lives on `/results` and stays the only one.

**Tests:** the path generator is pure and unit-testable; under the shared scale a
flat course produces a near-flat path and a mountain course does not; a course whose
array is all one elevation does not divide by zero.

**Shipped, with three things that differed from the plan:**

- **Delivery is a fourth option, a blend of 1 and 3.** `/courses` is a server
  component but the table is a client one (it owns the sort and the location
  filter), so the rows render in the browser and "no numbers cross the wire" was
  never available: the path strings have to ride in as a prop. They come from a
  dedicated cached read, `getCourseProfilePaths` (`course-profile-paths-v1`), so
  `CourseSummary`, the catalog cache key and the homepage are untouched. Measured
  across all 326 courses: 369 bytes each, 120 KB raw, 33 KB gzipped, and it
  appears in both the HTML and the flight payload.
- **The scale is a floor only, not floor-and-ceiling.** The plan said a mountain
  course "runs off the top of the band". Built that way, La Paz drew as a valley
  floor, St George as a tail and Pikes Peak as two stubs, so anything over 600 ft
  of relief is now fitted to the band whole, exactly as `ElevationChart` does.
  Under 600 ft one shared scale holds (Chicago is flat, Berlin is flat). The cost:
  the ~10% of courses above the floor are not height-comparable with each other
  here; the Climbing column and the profile label carry that.
- **The profile pill is gone from the column.** The plan kept `DifficultyBadge`
  beside the shape; on review the column was cut to the line alone. The label
  survives as `sr-only` text, since the SVG is `aria-hidden`.

Code: `src/lib/chart/sparkline.ts` (pure), `src/components/ProfileSparkline.tsx`.

## 16. [x] Per-factor impact breakdown

**Status:** **Done** 2026-09-21 · **Ease:** ●●●○○

One panel: Elevation, Altitude, Heat, Humidity, Wind, each as a percentage, adding
up to a stated total. Today the app gives a runner one number ("2.1% harder") and no
account of where it came from.

**Four findings shape this, and three of them are the difference between a panel
that is right and one that quietly contradicts another page.**

**1. Humidity is not a separate factor today.** `heatIndexC(tempC, humidity)` folds
relative humidity into a single apparent temperature, and `calculateHeatAdjustment`
maps that to a slowdown. There is no humidity multiplier to read. To give humidity
its own line, define it as a **marginal**: the slowdown at the actual humidity minus
the slowdown at a stated dry reference, with the remainder attributed to
temperature. The reference has to be chosen, written in the module header, and named
on screen, because the split is a presentation of one model rather than two models.

**2. Multipliers compose multiplicatively, so percentages do not add.** 1.03 × 1.02
is 1.0506, not 1.05. Decompose in **log space**: factor *i* takes
`ln(m_i) / Σ ln(m_j)` of the total percentage. That sums exactly by construction, is
order-independent, and collapses to plain addition when the factors are small, which
they usually are. This is the module's whole job and the invariant its test asserts.

**3. The total must reconcile with "vs flat", and two different curves stand behind
the two pages.** `/courses` prints `totalEffortMultiplier` — the **cost** curve
(`courseCost.ts`, k_up 1.95 / k_down 0.80) multiplied by altitude, geometry only,
no weather. The splits on `/results` are built from the **engine** curve
(`adjustmentFactor`, damped k = 0.35). §12 explains why both exist and why
neither is wrong. Therefore:

- Build the Elevation and Altitude lines from `cost`, so that Elevation +
Altitude equals the ranking table's "vs flat" for that course exactly. That is the
reconciliation the request asks for and it is achievable to the last decimal.
- Heat, Humidity and Wind are lines **on top of** that figure, and the panel's total
then legitimately exceeds "vs flat". Say so: "vs flat" is terrain and thin air,
the weather lines are the conditions on the day.
- **Do not build the Elevation line from** `adjustmentFactor`**.** It would print a
different elevation percentage from the one the same course shows on `/courses`,
with nothing on either page to reconcile them. This is the single decision most
likely to be got wrong here.

**4. Altitude is priced into comparisons but not into the splits.** That is the open
question left by §7: `/compare` says a 3:20 at Berlin is worth more
time at Boulder, but the Boulder pace chart still hands back exactly the goal typed
in. This panel is where that inconsistency becomes visible for the first time, so
either take the decision now (apply altitude after normalization, the way heat and
wind already are, changing the headline finish time for 28 of 326 courses) or label
the altitude line as a comparison cost the splits do not charge. **Take the decision
with this project** rather than shipping the panel and leaving it.

**Module:** `src/lib/pacing/impact.ts`, pure, returning the per-factor multipliers
and their exact shares plus the total. Default state matters: with weather off —
which is the default — the panel shows terrain and altitude only, and on a flat
sea-level course every line is 0.0% and must read as a clean zero rather than as
NaN or an empty panel.

**Tests:** shares sum to the total to floating-point tolerance; a single active
factor takes 100% of it; all-zero returns zeros with no NaN; and, over all 326
course files offline, Elevation + Altitude reproduces `totalEffortMultiplier`
exactly — that last one is what stops the two pages drifting apart.

**What shipped, and where it differs from the plan above.**

- **Humidity got its line back, on the second pass.** It shipped folded into a
single Heat line, on the argument that splitting it meant inventing a marginal
against a chosen reference. That was wrong IN USE: moving the humidity slider
changed the Heat tile, so the tile looked like it was lying about what it
measured. The split the original plan described is now what ships, against
`DRY_REFERENCE_RH` in `src/lib/weather/heat.ts`:

  ```
  heat     = calculateHeatAdjustment(t, DRY_REFERENCE_RH)   air temperature alone
  humidity = calculateHeatAdjustment(t, rh) / heat          what moisture adds
  ```

  so `heat × humidity` is the multiplier the engine actually applied, exactly.
  **The reference is 0 % RH, not a typical morning like 30 or 50 %**, because a
  non-zero reference makes the humidity line negative on any drier-than-reference
  day, which reads as "the humidity is helping" when the reference was simply
  picked badly. At 0 the marginal is non-negative across the whole grid, which
  `heat.test.ts` sweeps. It behaves: +0.4 % at 18 °C / 40 % RH, +1.1 % at
  25 °C / 90 %, +17.7 % at 32 °C / 95 %. Both tooltips name the baseline, because
  a split against an unnamed reference is a number nobody can check.
- **`dryHeatMultipliers` rides alongside `heatMultipliers` on `PacingResult`**,
and is presentation only: `computePaceChart` still reads the combined array and
no split moved by a millisecond. `usePacingChart.test.ts` pins that.
- **Altitude has no line at all.** It shipped with one, labelled as a comparison
cost the splits do not charge, and the tile was cut on review: it read 0.0% on 294
of the 326 seeded courses, so for almost every runner it was a permanently blank
tile explaining something that was not happening. The splits were never charged
for altitude and still are not, so nothing about the pacing engine changed either
way. **The cost, written down so it is not rediscovered as a bug:** on the 32
courses above 1,000 m the panel now UNDERSTATES the course and its total no longer
reconciles with "vs flat" on /courses. La Paz totals +13.5% here against "36.5%
harder" there, because thin air is the larger half of that course and nothing on
screen accounts for it. The header of `impact.ts` carries the same note. If
high-altitude races ever become a real part of the catalogue, this is the first
thing to revisit, and the "Inherited, still open" entry below is where the wider
altitude question lives.
- **All four tiles show on every course**, with Heat, Humidity and Wind at 0.0%
when weather is off rather than the panel shrinking to one tile. A row that
changes shape is harder to read than a row where three are quiet, and a missing
tile is ambiguous between "zero" and "not measured".
- **No explanatory prose.** The panel shipped with a subtitle and a closing note
reconciling its total against "vs flat"; both were cut, along with the total row's
info popover. The tiles, their labels and the three remaining popovers carry it.
Title is "Impact breakdown", which pairs with the "Total Impact" row rather than
narrating, and the total row's own popover went with them: a sum of the row
directly above it needs no explaining.
- **The tiles print shares, not standalone percentages.** `ImpactLine` carries
both: `percent` is what a factor costs alone, `sharePercent` is its log-space
slice of the total. Only the second set adds up to the total row, and a panel
whose own arithmetic does not check out is worse than no panel.
- **Heat and wind are collapsed by a duration-weighted geometric mean**
(`weightedGeometricMean`), not a plain average. Duration is what the engine
multiplied them into, so this is the factor that actually produced the adjusted
finish; weighting by distance would under-count the slow, hot, late kilometres.
`usePacingChart.test.ts` pins that the carried arrays reproduce
`adjustedFinishSeconds` exactly.
- **The terrain half still reconciles.** Over all 326 committed course files the
Elevation line equals `costMultiplier` by `===`, not by tolerance, so the two pages
can never disagree about what a course's SHAPE costs. Boston reads −0.6% against
"0.6% faster" on /courses. Two things that look like disagreements and are not:
Berlin reads +0.3% where /courses says "flat-equivalent", because
`FLAT_EQUIVALENT_BAND` suppresses claims under 0.5%; and any course above 1,000 m
reads low, for the altitude reason above.
- **#17's carry landed here**, since it was cheaper to surface
`segmentDurations`/`heatMultipliers`/`windMultipliers` on `PacingResult` once than
to have two consumers recompute them.

Code: `src/lib/pacing/impact.ts` (pure), `src/components/ImpactPanel.tsx`,
per-segment carry on `src/hooks/usePacingChart.ts`.

## 17. [x] Per-factor split adjustments chart

**Status:** Done 2026-09-22 · **Ease:** ●●○○○

The per-segment version of #16: a bar chart of each split's deviation from even
pace, with tabs for Total, Elevation, Heat, Wind and Humidity.

**Segmentation is the runner's, not the screenshot's.** Bars are one per kilometre
or one per mile, following the existing unit toggle. No 3 km rebucketing and no
third increment — the chart has to line up with the splits table directly above it
or it is a second, competing account of the same race.

**The data is already on** `PacingResult`**.** #16 surfaced the carry this project
needed: `segmentDurations` (elevation plus strategy, normalized), `heatMultipliers`
and `windMultipliers`, all length-matched to `rows` and all exactly 1 when weather
is off. Read them; do not recompute in the component, which is how a chart and a
table start disagreeing. `usePacingChart.test.ts` pins that duration × heat × wind
summed reproduces `adjustedFinishSeconds`.

**Define the bar as seconds against the even-pace baseline** for that segment
(`goalTimeSeconds × lengthKm / 42.195`). Then the y axis reads "seconds faster or
slower than even pace here", which is what the runner wants to know, and the bars
sum to the finish delta.

**Three properties to state up front, because they look like bugs otherwise:**

- **Elevation bars net to approximately zero across the race.** `normalizePaces`
normalizes the grade-adjusted durations to the goal, so the climbs are paid for by
the descents by construction. The Elevation tab will balance; the Heat tab will
not.
- **Heat is always ≥ 0; wind goes both ways.** A tailwind segment genuinely runs
faster, and the wind model is deliberately asymmetric (headwinds cost more than
equal tailwinds help).
- **The final segment is a stub** (0.195 km, or 0.2 of a mile). Fold it into the
previous bar for the chart, and note that the splits table deliberately does not.

**Altitude gets no tab.** #16 shipped without resolving altitude into the splits
(see its write-up), so it is still not in the durations and a bar for it would be
inventing one. If the altitude decision is ever taken the other way, this is one of
the places that changes.

**Tests:** bars sum to the finish delta; elevation bars sum to ~0 at the default
strategy; with weather off, the Heat and Wind tabs are absent rather than flat zero;
km and mile modes produce the right bar counts.

---

**Shipped 2026-09-22.** What differed from the plan above:

- **This was a change to a shipped chart, not a new one.** `RaceSplitsChart` already
drew one bar per split, but against FLAT GROUND, and that baseline cannot carry
tabs: heat and wind have no flat-ground reading, so the parts could never be made
to sum to the whole. Its zero line is now even pace and its tooltip reads "vs even".
What the terrain costs against flat is still on screen twice, as the Elevation tile
in the panel above and the "vs flat" column on /courses, so nothing was lost.
- **All five tabs always render, and all five open.** A factor doing nothing on
this course draws a flat line along the zero rule, on the same axis the other
tabs use, with the bars in neutral grey rather than red. This is the same answer
`ImpactPanel` gives directly above, where Heat and Wind print 0.0% rather than
vanishing.
  It took two wrong turns to get there, both worth recording. First the bar was
hidden entirely whenever only elevation was live, on the argument that a tab
which changes nothing is a dead click: right about the click, wrong about the
screen, because the first person to open the page saw a chart with no tabs and
reasonably concluded the feature had not been built. A control that is invisible
until an unrelated switch is flipped does not read as conditional, it reads as
absent. Then the dead tabs were shown but disabled, which advertises the feature
and still refuses the question. A flat line IS the answer to "what is the wind
costing me?" on a still day.
- **Zero bars are neutral, not red.** A hairline is drawn on every row so no
split goes missing from the picture, and a row of exactly-zero hairlines painted
red would claim a cost that is not there. `--color-text-tertiary` at exactly
zero, matching `ImpactPanel`'s tiles and this chart's own tooltip. Exactly zero,
not "rounds to zero": a kilometre worth four tenths of a second still cost
something, and only an inactive factor produces real zeros.
- **The factor control is a new `UnitToggle` variant, `"tab"`:** the red
`prominent` colouring at `compact` size. DESIGN.md hands `--color-red-fill` to
"the active toggle segment" and this selection is the panel's subject rather
than one field's unit, so it earns the red; the prominent padding crowded the
h2 it sits beside. `compact` and `prominent` are untouched, so the form's
toggles are unchanged.
- **The stub folds in SECONDS space, after the decomposition**, not at the
multiplier level. Folding two segments' multipliers needs a mean and would break
the sums the whole chart rests on; adding two seconds values preserves every sum
exactly, for the total and each factor alike. 42 bars in km, 26 in miles.
- **One y domain across all tabs**, spanning every series the reader can switch
to. Rescaling per tab would draw a two-second heat bar at the same height as a
thirty-second climb, and how much smaller one factor is than another is the first
thing switching tabs should teach.
- **Elevation nets to zero exactly with weather off and to under a second with it
on.** The log-space split hands each factor a slice of a delta the factors jointly
caused, so a hot kilometre's elevation slice scales slightly differently from a
cool one's. 0.67 s across a four-hour Boston, well under the second the chart
rounds to. `splitImpact.test.ts` pins it under two.
- **`segmentLengthsKm` is a new carry on `PacingResult`**, for the same reason #16
added the others: the even-pace baseline needs lengths, and a component that
rebuilt the segments to get them would be one `buildSegments` change away from
drawing a different race from the table beside it.
- **For #22:** `splitImpact` is the per-segment source the interactive map plans to
colour its route line from, but note its output is 42 or 26 bars with the tail
folded, not 44 coordinate samples. The map wants the unfolded series, which means
exporting one or re-running the decomposition without the fold.

Code: `src/lib/pacing/splitImpact.ts` (pure, new), `src/components/RaceSplitsChart.tsx`,
`segmentLengthsKm` on `src/hooks/usePacingChart.ts`.

---



# Phase 5 — weather reach



## 18. [~] Extend the forecast horizon to 14 days

**Status:** Deferred 2026-09-21 · see "Explicitly deferred"

Dropped as scoped. The horizon stays at **5 days**, which is what Tomorrow.io
actually serves, and #19 shipped against that number rather than waiting on this.

Two reasons, both recorded in full in the deferred section below so the argument is
not re-derived from scratch: Tomorrow.io's hourly timeline tops out near 120 hours,
and the only provider already in this stack that reaches 16 days is licensed for
non-commercial use, which pacebands are not.

What this project WAS going to contribute has been built anyway, because #19 could
not ship without it: `src/lib/weather/horizon.ts` holds `FORECAST_HORIZON_DAYS`, and
both `/api/weather` and the calendar read it. Raising the horizon is now a one-line
change in that file plus a new branch in the route. That is the whole reason the
constant exists, and it is why deferring this costs nothing later.

## 19. [x] Forecast-available highlight on the calendar

**Status:** **Done** 2026-09-21 · **Ease:** ●●○○○

A race whose day falls inside the forecast horizon carries a green edge on the home
calendar, so a runner can see at a glance which of the coming weeks' races can be
paced against real conditions rather than a ten-year average.

**What shipped**

- `src/lib/weather/horizon.ts` — `FORECAST_HORIZON_DAYS` (5), `daysUntilISO` and
`hasLiveForecast`, pure and DOM-free so a server route and a client component can
both import it. No literal 5 exists anywhere else.
- `RaceCalendar` marks both layouts: the desktop grid's `EditionChip` and the
sub-`sm` agenda's `EditionRow`. The flag is arithmetic on the date, computed
during render with **no weather request**, which is what lets the grid mark
hundreds of editions without a fan-out.
- `dateConfidence` is honoured: an estimated date does not highlight.
- The reserved semantic green, unmodified, plus a `title`, an addition to the
accessible name, and a legend line — colour does not carry it alone.

**Differences from the plan**

- **The horizon is 5, not 14** (see #18). The constant made this a number, not a
rewrite, exactly as the plan predicted it would.
- **The mark is a tinted chip, and green grew a second token to do it.** It took
three passes. A 3px `--color-green-primary` left rule was invisible in a grid of
pale chips. A `#DCFCE7` fill at 84% saturation with a green outline overshot: on a
near-monochrome page it read as an alert, and the outline made the chip look
selected rather than annotated. The settled version tints only, at 44% saturation,
keeping the neutral border and neutral text. **This is a design-system change**,
recorded in DESIGN.md and Rule 2: green has two roles exactly as red does, though
it pairs with dark text rather than white and differs per theme.
`globals.tokens.test.ts` now fences it from both sides, with a ΔE floor against
`--color-bg-elevated` so it cannot vanish and a saturation cap against
`--color-green-primary` so it cannot creep back up.
- **Estimated dates DO highlight**, which reverses the plan. The plan argued an
estimated date should not claim forecast precision. In practice `estimated` is the
seed's DEFAULT, so excluding it left the mark on almost nothing — the calendar
showed two races five days out and marked neither, which is how the reversal was
found. It was also out of step with the app: `weatherSourceFor` serves a real
forecast for ANY future date and only forces climatology for an estimated date in
the PAST. That asymmetry is the right one, because an estimated past date would be
passed off as conditions recorded on a specific morning that may be the wrong
morning, whereas a forecast makes no such claim. The chip still carries its own
"est." qualifier beside the mark.
- **The legend is conditional.** It renders only when something on screen actually
carries the mark, computed over the rendered grid cells rather than over the
month's editions, because the grid's first and last rows spill into the
neighbouring months and those chips are marked too.

**Found and fixed on the way, which is why the panel was failing at all.**
`loadForecast` let a non-200 from Tomorrow.io throw. That unwound past the
climatology fallback and landed in the route's outer catch, which answers 502 — so
a spent free-tier quota (25 requests an hour) showed "Conditions unavailable.
(Failed to reach the weather service.)" on a race five days out, with a perfectly
good ten-year average one unreached branch away. It now returns null and falls
through, and `src/app/api/weather/route.test.ts` is the regression test. The route
also checks `FORECAST_HORIZON_DAYS` *before* calling Tomorrow.io, so a race months
out no longer spends quota discovering what the constant already knows.
`forecast.live.test.ts` now skips on 429 instead of failing, and memoises its one
fetch across all three tests.

**Still open:** confirm `TOMORROW_IO_API_KEY` is set in the **Vercel** project
environment and not only in `.env.local` — inherited from #18's checklist and not
verifiable from here. Production without it silently serves climatology for every
near-term race, which looks exactly like working software.

---



# Phase 6 — design system



## 20. [x] Night mode toggle

**Status:** **Done** 2026-09-21 · **Ease:** ●●●○○ · **Amends Rule 2 and DESIGN.md**

**Shipped as recommended:** manual two-state toggle, default light, `prefers-color-scheme`
never read (not even as the initial value). Rule 2 and DESIGN.md § Theme are amended in the
same commit and record both the old argument and the new one. What differed from the plan:

- **Red needed two tokens, not one.** Not in the plan. A red light enough to read as text on
  near-black cannot carry white type at AA, so `--color-red-fill` / `--color-red-fill-hover`
  (identical in both themes) took over the 11 white-text controls, and `--color-red-primary`
  lightens in dark for text and data marks.
- **`--color-scrim` is new.** `text-primary` at 40% is a white veil in dark mode.
- **The dark ramp** is `#68CF9A / #8FC954 / #D3AE69 / #DB9E76 / #E08571 / #E66B6D`. The two
  reds could not both keep hue order and AA the way light does, so Hilly leans orange-red.
- **The footer goes lighter than the page in dark**, rather than sharing the light values.

**Revised 2026-09-21, same day, after a design review against standard dark-mode guidance.**
The first pass was technically correct and visually too dark: it read as flat and harsh.
Four things were wrong and all four are now guarded by tests that fail on the old values.

- **No surface ladder.** Page and card were both `#0A0A0A`, so a card never lifted and a
  1.3:1 border was the only thing marking its edge. Now `#121212` → `#1C1C1C` → `#242424`.
  Dark cannot use shadows for depth, so lightness has to do it.
- **Near-black plus near-white.** `#FAFAFA` on `#0A0A0A` is ~19:1, the glare that reads as
  harsh, and pure black leaves nowhere to go for elevation. Now `#E6E6E6` on `#121212`, 15:1.
- **Tertiary text failed AA.** `#737373` on the elevated surface was 3.8:1, and it is the
  token the column headers and axis labels use. Now `#919191`, ≥ 4.5:1 everywhere.
  (Light's own tertiary is 2.5:1 on white, a separate pre-existing question, left alone.)
- **The ramp was fully saturated** (HSL up to 96%), which vibrates on a dark field. Now
  52-71%, under a tested ceiling.
- **The footer had to move twice.** Set against the page alone it was `#1F1F1F`, which then
  merged into the home page's closing CTA band at 1.06:1. It has two possible neighbours;
  the test now asserts both.
- **The map's dark style is `styles/dark`, not `dark-matter`** (404). Theme changes call
  `setStyle` and re-add layers on `style.load`; the pin colours are re-read each time.
- **Print** is handled by wrapping the dark block in `@media not print`, so no light values
  are restated. The on-screen paceband preview restates five and a parity test guards them.
- **Nav width was not a `sm` question.** The desktop row already wrapped at 1024-1050px with
  six links (a pre-existing bug), and the toggle stretched it to ~1100px, so the row now
  breaks at `xl`. Below 1280px the links sit behind the menu button.
- **Flash of wrong theme:** solved with the blocking script, built from the storage key.
- **Tests:** `globals.tokens.test.ts` runs the ramp checks per theme plus a parity check;
  `theme.test.ts`, `ThemeToggle.test.tsx`, and `theme.guard.test.ts` (no `dark:` utility,
  no `prefers-color-scheme`) are new.

A toggle in the nav that switches the site to a dark theme.

**Read this first: it reverses a written position.** CLAUDE.md Rule 2 says the app
is light mode only and to never add a `dark:` variant, a `prefers-color-scheme`
block, or per-component theme logic. DESIGN.md argues the case at length and sets
`color-scheme: light` on `html` so native controls follow. Shipping this means
**amending both files in the same commit**, with the new position written down as
deliberately as the old one. Do not add a theme quietly against a rule that names
it.

**Why it is cheaper than it looks.** The palette is **20 tokens** in one `@theme`
block, and the codebase is genuinely disciplined about them: across every component
there are exactly **nine hardcoded hex values**, six of them in
`opengraph-image.tsx` (a static social image that stays light regardless) and three
`readToken` fallbacks in `CourseMap.tsx`. There is not one `bg-white` or
`text-black` in the tree. So the theme itself really is a second set of token
values.

**Where it is not cheap, in descending order:**

1. **The six-stop course-profile ramp.** `globals.tokens.test.ts` asserts that every
  stop clears WCAG AA **as pill text on white and on the elevated surface**, and
   that the six stay distinct and monotone in hue. Those same hexes fail against a
   near-black surface — `--color-red-deep` at `#7F1D1D` is nowhere near AA there. A
   dark theme needs a **second set of six**, still distinct, still monotone, still
   AA on the dark surface, and the test has to check both themes. This is the real
   work of the project, and DESIGN.md's "two closed exceptions" framing has to
   absorb a second ramp without becoming a licence for a third.
2. **The footer.** DESIGN.md is explicit that it is the one dark surface *by design*
  and *not* a theme exception, with its own `*-on-dark` ramp scoped to
   `SiteFooter`. In dark mode a near-black band at the foot of a near-black page
   stops being a band at all. Either the footer takes its own dark-mode values or
   that paragraph stops being true. Decide and rewrite it.
3. **The map.** `BASEMAP_STYLE` is OpenFreeMap positron, chosen specifically because
  it is near-white and leaves red free to mean "race". Its sibling style is
   dark-matter, so the constant plus a theme read is most of it, but the pin colours
   are read through `readToken` **once at init** and would need re-reading when the
   theme changes.
4. **Print.** The paceband must print light whatever the theme, or a dark-mode order
  comes out as a black rectangle. A `@media print` block forcing the light values,
   alongside the `print:hidden` that already exists on the nav.
5. **Flash of the wrong theme.** The preference persists through
  `src/lib/clientState.ts` with its key in `stateKeys.ts` (the precedent is
   `prefs.displayUnits`), but the homepage prerenders statically, so the stored
   choice is unknown until hydration. That needs a small blocking inline script in
   `layout.tsx` setting `data-theme` before first paint. It is the one piece of this
   that is not tokens.
6. `color-scheme` on `html` follows the theme, so native controls, the date and time
  pickers, spinners and scrollbars come with it.

**Two decisions to make before writing code**

- **Two-state or three-state.** The reference is a single moon icon, i.e. a manual
two-state toggle. Recommendation: manual two-state, default light, and read
`prefers-color-scheme` **not at all** or only as the initial value — say which.
Defaulting to the system preference changes the site for visitors who never asked
for it, on a product whose entire design argument is that the page is white.
- **Where it sits.** §8 records that the nav is at its width budget: four
links already need `gap-6 lg:gap-8` to stay on one line at `sm`. A 32px icon
button satisfies #6's height invariant but not obviously the width one. Check at
`sm` before committing to a position.

**Tests:** `globals.tokens.test.ts` extended to both themes; a token-parity test
asserting every token defined in light is also defined in dark, because the failure
mode is a forgotten token silently inheriting its light value; the toggle persists
and restores; and a source guard that no `dark:` utility appears in a component,
keeping the discipline at the token layer the way the em-dash test keeps Rule 11.

---



# Phase 7 — new stored geometry

Both projects here need a course outline the database does not currently hold. Read
#21 before scoping #22.

## 21. [x] Course outline map (static)

**Status:** **Done** 2026-09-21 · **Ease:** ●●●●○

The course's shape as a small graphic — the Strava-style silhouette with a start dot
and a finish dot — on the race card, the results header, and possibly beside #15's
elevation sparkline.

**The data does not exist yet, and this is the whole cost of the project.**

- `course.coords` is **44** `[lat, lon]` **pairs**, one per kilometre. It exists to give
each segment a wind bearing, and at thumbnail size a city marathon drawn from it
is a 44-gon: every turn between samples is gone.
- The dense array in the database is `profile`, which is `[distanceKm, elevationM]`.
**No coordinates.**
- The full track exists only in `data/gpx_sources/*.gpx` — 326 files, 24 MB — which
never reaches the app.

So this needs a **new column**: `course.outline`, a simplified `[lat, lon][]`
polyline computed at seed time from the source GPX with Ramer-Douglas-Peucker at a
tolerance tuned to hold the shape at thumbnail size. Target a few hundred points and
a few KB per row. That is `src/db/schema.ts`, `npm run db:generate`, a committed
migration, the seed precompute, and the checksum path that decides when geometry is
re-uploaded.

- **Uploaded** `u-` **courses get theirs in the upload route**, from the file it has
already parsed in `src/lib/course/`. Otherwise this feature silently skips every
uploaded course, which is the kind of gap that gets discovered by a paying
customer.
- **Do not add** `outline` **to the catalog query.** Same reasoning that keeps `profile`
out of it (7-48 KB per row across 326 rows) — see the header of
`src/db/queries.ts`. It rides with the single-course geometry read, or with a
dedicated endpoint. The light/heavy split exists precisely to stop this.

**Rendering needs no library and no tiles.** Project with equirectangular scaling
(`x = lon × cos(meanLat)`), fit the bounding box into a viewBox preserving aspect
ratio, emit an SVG path. Pure, unit-testable, printable, and it works identically in
a table row, a calendar card and a social image. Start dot in the reserved semantic
green, finish dot in brand red.

**Run one sanity check before building anything:** render the twistiest seeded
course and the simplest at 120px and confirm a single RDP tolerance holds the shape
of one without bloating the other. If it does not, the tolerance becomes per-course
and that is a different, more expensive project.

**Decide where it goes**, because each placement is its own payload question: the
calendar card (hundreds of editions on screen at once — this is the demanding one),
the results header (one course, geometry already loaded, essentially free), the
ranking table (326 rows, same question as #15 and probably the same answer:
server-render the path).

### What shipped, and what turned out differently

**The sanity check passed, and the reason is worth recording: the tolerance is
RELATIVE, not metric.** The plan asked for one RDP tolerance across the twistiest
and the simplest course before anything was built. A fixed metre epsilon would not
have survived that — it over-simplifies a compact city loop and under-simplifies a
point-to-point spanning 40 km of bounding box. Normalising the bounding box to a
unit square first makes epsilon a fraction of the rendered thumbnail, which is the
thing actually being held. At `OUTLINE_EPSILON = 0.002` across all 326 courses:
median 118 points and 2.4 KB, p95 302 points, max 552 points and 12 KB, against
median 812 raw trackpoints. Rendered at 200 units wide, the simplified path is
indistinguishable from the full track on both extremes. One constant, no per-course
tuning, and the project stayed the size it was scoped at.

**It went beside the elevation chart, not in the results header.** The header was
the first sketch: a tile at the right of the Goal time / Adj. finish / Average pace
/ Distance row. Two things argued against it. The row is 3-up or 4-up depending on
whether weather is applied, so a fifth cell squeezes the stats and wraps the "vs
goal" delta; and a silhouette sitting in a row of numbers reads as a fifth
statistic rather than a picture. Beside the profile it reads as what it is, the
same course told twice, the ground from above and the ground from the side.

**The precompute is TypeScript, not Python, and this is the one piece of the GPX
pipeline that is.** Rule 7 keeps Python to `scripts/gpx_parser/`, and the plan said
"computed at seed time from the source GPX". Writing it in Python would have bought
a second copy plus a second conformance test, because the upload route needs the
same function at runtime and cannot shell out to Python on Vercel — exactly the
cost `resample.ts` already pays. `parseRouteFile` already reads GPX in TypeScript,
so `scripts/build-outlines.ts` and the upload route both call
`src/lib/course/outline.ts` unchanged. There is nothing to hold in step.

**Adding a marathon gained a step**, `npm run build:outlines`, which writes the
fourth geometry file `<slug>.outline.json` beside the three the Python parser
writes. `courses.outline.integrity.test.ts` fails on a seeded course that is
missing one, so the step cannot be quietly skipped. CLAUDE.md's checklist and the
bulk-import command block both carry it now.

**The column is nullable and every consumer renders nothing when it is null.** An
upload too sparse to simplify, or a row seeded before this shipped, produces no
outline; the dashboard drops the whole column rather than leaving an empty frame
beside a full-width chart.

**Two details that only appear once real courses are drawn.** A loop course's start
and finish land on the same pixel, and two dots at one coordinate render as one of
whichever colour paints last, silently losing the start — so coincident ends
collapse into a single marker, green filled with a red ring. And the viewBox takes
the COURSE's aspect ratio rather than a fixed one, because a fixed box fits twice
(course into box, box into container) and leaves a wide course like Boston
letterboxed inside a tall box for no reason. Elongation is clamped at 2.5:1 so a
near-straight out-and-back does not scale its end dots up to fill the card.

**Still to place, and the ranking table was TRIED AND REVERTED on 2026-09-22.**
The calendar card remains open, and it is the payload question the plan named in
its most demanding form: hundreds of editions on screen at once, with the outline
deliberately absent from the catalog query. Do not solve it by adding `outline` to
`loadCourseCatalog`.

The ranking table placement was built end to end and then removed the same day,
because at row height it simply did not read: most courses are a point-to-point
line or a small tangle, and 326 of them stacked down a column is visual noise
rather than the signature the mark is on /results. Recorded so it is not
rediscovered as an obvious idea and rebuilt. If it is ever revisited, the
mechanics worked and are worth repeating: a second cached read beside
`getCourseProfilePaths` keeps the heavy column off the catalog, and the stored
outline must be re-run through RDP at the thumbnail's own scale (a fraction of the
RENDERED longer side, so it is the same algorithm asked the smaller question)
because shipping the 200-unit path into 326 rows is roughly a megabyte. At a 40 px
box the end dots have to go: two 6-unit circles cover most of the drawing.

## 22. [x] Interactive course map

**Status:** Done 2026-09-22 · **Ease:** ●●●○○

Click the outline, get a real map of the course.

**Most of this already exists as a working precedent.** `maplibre-gl` is already a
dependency, so Rule 5 is satisfied with nothing new.
`src/components/home/CourseMap.tsx` has already solved the basemap choice, the
worker sync (`scripts/sync-maplibre-worker.mjs`), reading pin colours from tokens,
and camera persistence through `clientState`. A single-course map is **less** than
that component does: a line layer instead of a clustered point source, `fitBounds`
to the course, two markers.

**What is genuinely new**

- **Load maplibre only when the modal opens.** The library is large and `/results`
must not pay for it on first paint because a map might be opened. Dynamic import
at open time, with the static outline from #21 standing in as the affordance.
- **A DRAWER, NOT A MODAL — amended 2026-09-21 when #21 shipped.** This section
said to follow `PrintModal` / `OrderModal`. The reason to change it is #17: once
the route line is coloured by per-segment pace or wind, the map is explaining the
plan, and a modal hides the plan while it does so. The static outline expands in
place, below the row it sits in, and stays visible as the collapse control. Keep
Escape-to-close and focus return from `usePopover`, but this is a disclosure
region, not `role="dialog"` with a focus trap.
- **The static outline is the loading state.** Opening costs a dynamic import plus
tiles. Draw the same SVG path scaled up inside the drawer immediately and fade
the real map in over it, so the wait reads as a zoom rather than a spinner. The
geometry is already in the browser, so this is free. Prefetch the module on
hover or focus of the tile.
- **Collapse the drawer when the course changes.** `Dashboard` swaps geometry under
the row, and a map still showing Berlin under a header that says Boston is the
class of bug `courseIsCurrent` already exists to prevent.
- Kilometre markers along the route come free: `coords` is already sampled at
0, 1, … 42 km.

**The version worth building, and the reason to do this after #17.** Colour the
route line by the plan itself — pace, gradient, or the per-factor delta from #17,
the way the reference screenshot shades headwind against tailwind. Nobody else has
that, because nobody else has the per-segment model behind it, and it is cheap once
#17 exists: the per-segment array is already aligned 1:1 with the 44 coordinate
samples. Recorded here rather than as its own project.

---

**Shipped 2026-09-22.** What differed from the plan above, in the order it
matters:

- **IT IS A FULLSCREEN DIALOG, NOT A DRAWER. The amendment above was reversed.**
The drawer argument — that a map explaining the plan should not cover the plan —
is sound and was tried. It loses to geometry: a marathon route at a zoom where
streets are legible needs the whole viewport, and at drawer height most city
courses render as an unreadable tangle. The cost the amendment named is real and
is paid, so it is mitigated rather than denied: the hover readout carries that
split's own adjusted pace, so the map answers the question the hidden splits
table would have. `CourseMapOverlay.tsx` states this at the top, and `Escape`,
focus return and a focus trap all behave as a dialog rather than as a
disclosure.
- **The route line is the OUTLINE from #21, not `coords`.** Stated obliquely
above; worth stating plainly because it is the design's one real compromise.
`coords` is 44 points and draws a 44-gon. The outline is the simplified GPX
track, already in the browser for the course on screen, and at map zoom its
corner-cutting is visible on tight turns. The alternative is a fifth geometry
file across 326 courses, a DB column, a re-seed and an upload-route change; that
is the upgrade path if the simplification ever reads as a bug.
- **A simplified outline measures short, and that had to be handled.** RDP cuts
corners, so walking the polyline totals less than 42.195 km — by a fraction of a
percent straight, several hundred metres twisty. Marking kilometres against the
walked distance drifts steadily forward, putting the 40 km marker most of a
kilometre from where 40 km actually is. `cumulativeKm` normalises the last vertex
to exactly MARATHON_KM, spreading the error instead of accumulating it. Markers
are then placed on the sliced line itself rather than from `coords`, because the
two disagree by exactly the simplification and a marker floating a block off the
route reads as a bug.
- **Sliced per SEGMENT, not per kilometre.** `windMultipliers` and `rows` are 1:1
with `buildSegments(elevations, unit)`, which is 43 km segments or 27 mile ones.
Slicing by segment keeps line, splits and markers aligned by construction, so a
runner in miles gets mile markers rather than kilometre data relabelled.
- **THE NEUTRAL THRESHOLD IS DERIVED, WHICH IS THE IDEA WORTH KEEPING.** The
brief was "only colour it if it actually makes a difference", and the temptation
is a magic constant. The splits table prints whole seconds, so a wind that cannot
move a split's printed pace by one second is not a difference a runner can act
on: the threshold is `100 / splitDurationSeconds` percent, 0.37% per kilometre at
4:30/km. It tightens correctly for a slower runner and a longer split, both of
which have more seconds for the wind to move.
- **Strength is opacity and width on two existing tokens, not new colours.** A
true green-grey-red spectrum would mean six or eight new tokens, each needing a
hand-picked dark value, which is the second ramp Rule 2 forbids. Over a basemap
with no colour of its own, opacity reads as density. Nothing was added to
`globals.css`, so `globals.tokens.test.ts` did not move. Neutral is NOT
transparent: it draws in `--color-text-tertiary` at a fixed 0.55, because the
route is the subject of the map and a calm day would otherwise erase it.
- **Kept from the plan, and worth it:** maplibre loads only when the overlay
opens (`next/dynamic`, `ssr: false`, prefetched on trigger hover/focus), and the
static #21 outline is the loading state, so the wait reads as a zoom into a shape
already on screen. `cooperativeGestures` is OFF here, unlike the homepage map:
there is no page behind this one to scroll past.
- **Also carried:** the named climbs from #13 as a toggleable casing under the
route, and a start-line conditions chip (wind speed, compass point, temperature,
humidity) in the corner MapLibre's zoom controls do not own.
- **NOT carried:** a gradient or pace colour mode. That is #17 and stays there.
- The basemap style pair, worker URL, `readToken` and `styleFontStack` moved out
of `home/CourseMap.tsx` into `src/lib/map/basemap.ts` when this became the second
map on the site; `haversineKm` moved out of `home/courseMapData.ts` into
`src/lib/geo/haversine.ts` for the same reason. Both are re-exported or imported
by their original homes, so no caller changed.

**TWO WAYS THIS SHIPPED BLANK, both found only by driving a real browser.** The
overlay opened to a full screen of surface colour: no map, no route, no error.
Unit tests could not have caught either, because both are CSS and compositor
behaviour that jsdom does not model.

1. **`.maplibregl-map { position: relative }` beat Tailwind's `absolute`.**
The map container was sized by `absolute inset-0`. MapLibre adds its own
`maplibregl-map` class to whatever element it is handed, and `maplibre-gl.css`
declares `position: relative` on it. That import is UNLAYERED, while Tailwind v4
emits utilities into `@layer utilities`, and unlayered CSS beats every layer
regardless of source order. So the container lost its positioning the moment the
map attached, collapsed to **height 0**, and MapLibre rendered nothing at all:
no tiles, no route, no `load` event and no error. Measured live as
`mapDiv=1400x0` against a `1400x648` parent. The fix is that the container is
sized with `h-full w-full`, which does not care what `position` ends up as. The
homepage map was never affected because its container carries a literal `h-96`.
2. **A WebGL canvas inside `opacity-0` never finishes its first render.** The
first fix attempt held the canvas transparent until the map reported `load`, to
fade it in over the outline. The browser does not paint a fully transparent
subtree, so MapLibre's first render never completed, `load` never fired, and the
map stayed hidden forever: the condition for showing it was the thing hiding it
prevented. It was also unnecessary. A fresh WebGL canvas is transparent until
something is drawn into it, so the outline underneath shows through by itself
and is covered only when the basemap actually paints. `CourseMapOverlay.test.tsx`
now fails if either an opacity gate or a `hidden` class comes back.

The lasting lesson is the third change rather than either fix: **the canvas now
surfaces `map.on("error")`, constructor throws and dynamic-import failures to
the UI.** Both bugs presented identically as a blank rectangle, and neither cost
would have been paid twice if the first one had been able to say anything.

**Amended 2026-09-23: the outline tolerance was a thumbnail tolerance.** With
the map shipped, Boston's route visibly missed its own street, running through
the houses alongside Route 135. Nothing was wrong with the map: `OUTLINE_EPSILON`
is 0.2% of the course's bounding box, which is the right rule for a 200x140
silhouette and works out to 70 m on the ground for a 35 km point-to-point. #21
verified the tolerance at thumbnail size, which it passes, and that was the only
size that existed at the time. `OUTLINE_MAX_DEVIATION_M` (6 m) is the second,
absolute limit; the effective epsilon is the tighter of the two, so compact
courses are untouched and the long point-to-points tighten. All 326 outlines were
regenerated: Boston 47 points to 175, the payload total 1.5 MB to 1.65 MB, worst
single course ~18 KB against the 48 KB ceiling
`courses.outline.integrity.test.ts` already held. The knock-on is in `routeMap.ts`:
a tightened outline can now walk LONGER than 42.195 km, because the source GPX
runs long against the certified route, so the normalisation there is no longer
scaling in one known direction and its test no longer asserts one.

**And the tightened tolerance exposed a real bug in RDP itself.** Auditing all
326 outlines against their own source tracks showed three courses breaking the
6 m guarantee, one by 68 m. The cause was the textbook formulation:
perpendicular distance to the infinite LINE through the recursion's endpoints,
rather than to the chord as a SEGMENT. Where a course doubles back along its own
direction, the excursion's points sit on that line just past its far end, score
~0, and the whole turnaround is discarded as flat. new-hampshire-marathon lost a
68 m out-and-back at its finish, knysna-forest-marathon 44 m. Clamping the
projection to the segment fixes it and subsumes the degenerate-chord special
case a loop course needed. Worst deviation across all 326 is now 6.5 m, within
the cap once 5dp rounding is allowed for, and `outline.test.ts` carries the
turnaround case (verified to fail against the old metric).

**Also amended: the neutral route line was the basemap's grey.** On a calm
forecast the whole course drew in `--color-text-tertiary`, which sits within a
few percent of the basemap's own road fill. It is `--color-text-secondary` at
0.85 now, which is darker in light mode and lighter in dark mode, so it separates
from the tiles in both. The legend's midpoint moved with it.

**Amended 2026-09-23: the readout said numbers where it should have said words.**
Four corrections to the overlay, all of them about the sentence rather than the
map:

- **The hover readout no longer prints the wind cost as a percentage.** It said
"Headwind, +1.2%", which invites a precision the wind model does not have and
which a runner cannot act on mid-race. It now reads "Strong headwind" / "Moderate
tailwind" / "Light headwind", off `windStrengthWord`, which bands the SAME
`intensity` that paints the line. Binding the word to the ramp rather than to the
raw percent is the point: the darkest split on the course is the one that reads
"Strong", so the sentence cannot contradict the shade beside it. Three bands, not
five, because the readout has to be read at a glance.
- **A climb is now named by its number, not by the fact that it is one.** The
readout said "inside a named climb", which named nothing and, worse, is not even
true: Rule-abiding `HillPanel` deliberately does not name climbs. It says
"Climb 2", which is the badge on the Hill segments card for the same climb, so
the map and that section refer to one thing. `hill: boolean` became
`hillIndex: number | null`.
- **That match was also wrong in miles, and is fixed.** `inHill` compared a route
feature's index against `HillSegment.startSegmentIndex`, but `courseHills` always
runs on kilometre segments while the route is sliced per display unit. In miles
that compared mile 16 against kilometre 16 and put the runner in the wrong climb
or in none. It matches on distance overlap now.
- **The conditions chip carries an arrow**, pointing the way the wind is
travelling. `windDirection` is meteorological and stores the direction the wind
comes FROM, which is what the "SW" beside it means, so the glyph is turned 180
degrees before it is drawn. An arrow at the stored bearing would point straight
back up the wind. And "Point at the route" became "Hover over the route".
- **The legend carries a needle at the hovered split.** Same amendment, one step
on: once the readout says "Moderate headwind" rather than a percentage, the
obvious next question is how moderate, against what. The legend bar already is
that scale, so `legendPosition` puts a mark on it. Each half of the bar IS
`intensity`, mirrored about the middle, which is the same number that paints the
line, so the needle, the word and the shade are three readings of one value. A
neutral split lands dead centre rather than being hidden: "the wind is doing
nothing here" is worth pointing at. The mark is a needle in `--color-text-primary`
with a surface-colour ring, not a coloured dot, because the thing under it is
already the colour and a mark with its own would read as a third value.
- **The expand badge came off the outline in `SummaryHeader`.** A plus icon faded
in on hover in the silhouette's top-right corner. The hover tint already says the
shape is pressable, and a second affordance on a 160px silhouette competes with
the course for the space. The `sr-only` label, the icon button in the row below
(which is what a phone gets, since the silhouette is hidden under `sm`) and the
rest of the behaviour are unchanged.



---



# Phase 8 — catalog and platform



## 23. [x] Systematic sweep of the races we do not have

**Status:** **Done** 2026-09-25 · **Ease:** ●●●●○

Work through every marathon findmymarathon.com lists, identify the ones missing from
our catalog, and find geometry for them. The catalog is the product's moat; 326
courses is not the ceiling.

**Where this stands today, so it is not restarted from zero**

- `data/import/findmymarathon-tracker.csv` already holds **766 rows**, of which
**540 are marked as having no goandrace listing in any crawl**. That file is the
backlog. The work is not discovery, it is sourcing geometry for rows that already
exist.
- Two pipelines are already built and documented. `scripts/import/` pulls from
goandrace via `/it/api_calendario.php` (the JSON behind the calendar's load-more;
scraping the HTML silently caps a batch at 28). `scripts/import/adopt.ts` ingests
a course file a human found, preferring the organizer's own site, normalizing
`<rte>` exports, KML/KMZ and GeoJSON, and filling missing elevation from a DEM
tagged `dem:<dataset>`. Two skills, `/import-races` and `/adopt-races`, drive
them end to end.
- The goandrace windows 2026-27 (129 marathons) and 2025-2029 (378) are **exhausted**.
The full catalogue runs to roughly 1,086 events back to 2015, and a course's
geometry does not expire, so reaching further back is how anything new is found —
with the rule that an archived race must be confirmed to still run before it is
seeded.
- **findmymarathon is a discovery roster only and never a geometry source.** Its
elevation charts are rendered JPEGs and it publishes no route data. That is
recorded in `scripts/import/README.md` with the evidence; do not re-investigate
it.

**So what this project actually is: the strategy for the 540.** The machinery
exists; what is missing is a repeatable way to find a course file for a race that
goandrace does not list. That means ranking the backlog rather than walking it
alphabetically, and deciding per source class:

- **Rank by reach, not by row order.** Big-city races and races runners actually
search for first. A tracker column for priority, so a session can take the top
twenty and stop.
- **Source classes to work through and to record a hit rate for**, so later batches
know where to look first: the organizer's own site (already the adopt path's
preference), the race's Strava route or segment, course-certification bodies
(USATF and AIMS publish certified maps for many US and international races),
municipal or event GIS files, and last a hand-drawn route traced against the
published course map.
- **A hand-traced route is a different kind of data and must be labelled like one.**
The DEM precedent is exactly right: `elevate.ts` records `dem:<dataset>` and never
lets modelled elevation be confused with surveyed elevation. Traced geometry needs
the same treatment in `adoptions.json` and the same flag through QA.
- **The review step stays non-optional.** `import:qa` marks everything `review` and
`import:promote` refuses until a human clears it, because `courseSlug` is
permanent the moment it ships (Rule 8) and `regionCode`, `timezone` and
`organizer` are never published by the source. At 540 rows the temptation to
`--force` is the main risk this project carries.
- **Fix the known-bad geometry in the same sweep.** §12 records that several
seeded courses badly under-record climbing (New York at 293 ft against a surveyed
966 ft; California International at 112 ft against 663 ft) and §9 records
Jack & Jill's Downhill reading −856 ft against a published drop near 2,000 ft.
Those are re-sourcing jobs, not model bugs, and this is the project that has the
tooling out on the bench. #13's hill panel makes them visible to runners, which
raises the stakes.
- **Rights are still unsettled**, and at this scale that stops being a footnote.
goandrace's `robots.txt` has no `Disallow` and their terms restrict neither
automated access nor commercial reuse, but nothing grants reuse either, and their
§5 assigns responsibility for uploaded GPX to the submitting user. Pacebands are
paid product. **Settle this before a batch of this size ships**, not after.

**Operational trap, already documented and still easy to hit:** `npm run build`
before `npm run db:seed` bakes a stale catalog into `.next`, so new courses appear
in the calendar but never in the pacing dropdown. `rm -rf .next` after seeding.

**Shipped 2026-09-25. 326 courses -> 344, across 18 new countries.** What landed,
and the five things that turned out differently from the plan above.

**The pipeline that was built**

- `scripts/import/roster.ts` (`npm run import:roster`) is the international
  discovery source this repo never had. It reads Wikipedia's six per-continent
  "List of marathon races" pages through the MediaWiki API and returns **391
  distinct races across 96 countries**. The tables turn out to encode the World
  Athletics label tier as each row's *background colour* (Platinum, Gold, Elite,
  Label), bold for a World Marathon Major and gray for defunct, so one parse
  yields the roster and the reach ranking together.
- `scripts/import/backlog.ts` (`npm run import:backlog`) merges the three
  worklists that had been living in three shapes into one ranked
  `data/import/backlog.csv`: **1,089 rows, 913 still open, 88 countries**. Its
  second feeder is the one nobody had looked at: **183 races goandrace listed
  and that were rejected only for "event page links no course map"**. Those are
  the cheapest rows in the backlog, because the race, its city and often its
  website are already known.
- `scripts/import/rank.ts` scores every row 0-100 from label tier, host-city
  population (GeoNames `cities15000`, trimmed and committed under
  `data/import/reach/`), a coverage-deficit bonus computed from `SERIES_SEED` so
  the ranking corrects the US/Italy skew rather than entrenching it, date
  proximity and longevity. `reachBasis` records why each row scored what it did.
- `scripts/import/trace.ts` (`npm run import:trace`) draws a course from its
  published map and snaps it to the road network, labelled `traced:<method>`
  through the same path `dem:` already travels.
- `docs/COURSE-RIGHTS.md` is the rights record CLAUDE.md kept deferring. Policy:
  **organizer-sourced or self-derived only**; `adopt.ts` now refuses
  `routeSource: "route-host"` without an explicit `--allow-route-host`.

**1. AIMS cannot be crawled, and the plan was wrong to assume it could.**
`aims-worldrunning.org/robots.txt` carries `Disallow: /events` and
`Disallow: /members` under `User-agent: *` — precisely the calendar and the
member list. Wikipedia plus World Athletics labels replaced it completely.

**2. Course certification is not a geometry source.** This was expected to be
the big unlock and it is not. USATF's database at `certifiedroadraces.com` does
serve a packet per certified course, but it is a **two-page PDF of raster
images**: 11 embedded images, no text layer, no coordinates. What it *is* good
for is validation: the search table publishes certified distance, **net drop in
m/km** and start-finish separation, all surveyed. California International's
certificate `CA18004DT` gives 2.21 m/km, i.e. 93.3 m of net descent, which is
within 2.5 m of what our geometry already said.

**3. The goandrace archive was the highest-yield action available, and it had
never been swept.** CLAUDE.md recorded 2025-2029 as exhausted; nobody had gone
back to 2015. One sweep of 2015-2024 returned **337 events, 67 of them with a
course map and not already seeded** — Singapore, Riga, Kobe, Hanoi and Nicosia
among them. Fourteen of the eighteen courses shipped here came from it.

**4. Two dedupe bugs, both found by that sweep, both fixed with evidence.**

- **goandrace's own pages are double-encoded UTF-8.** They declare and serve
  `charset=UTF-8` while containing the bytes for `ZÃ¼rich` where `Zürich`
  belongs. Since a locality is weighed against the seeded `citySlug`, the dedupe
  silently lost its city evidence on every accented city in Europe.
  `repairMojibake()` in `shared.ts` reverses it (cp1252 as well as Latin-1) and
  is applied to every scraped schema.org string.
- **A sponsor name that is also a city was matching as a duplicate.** Zurich
  Insurance sponsors marathons across Spain, and "Zurich Rock 'n' Roll Running
  Series Madrid" scored a perfect 1.00 against the seeded "Zürich Marathon"
  because `{zurich}` is a subset of its tokens. Madrid, Sevilla and San
  Sebastián were all being dropped. The first fix attempted was a general "a
  different city vetoes a match" rule; **measured against all 1,086 crawled
  events it would have let 52 genuine duplicates through**, mostly races whose
  city legitimately differs (a point-to-point start town, or a city named in
  another language: "Lisboa", "Parigi", "Pafos"). It was reverted for a narrow,
  evidence-gated `SPONSOR_CITY_WORDS` rule instead. A third bug went the other
  way: goandrace lists "Tokio Marathon", which shares no token with the seeded
  "Tokyo Marathon" and was about to be imported as a second Tokyo course. Fixed
  with a `tokio -> tokyo` alias.

**5. Tracing works, and costs far less than the elevation model already does.**
Calibrated against Berlin, whose surveyed line and surveyed elevation we hold:
modelling elevation along Berlin's *real* line more than doubles its recorded
gain (28.4 m -> 62.8 m) and drifts a 4:00 paceband by 3.2 s; re-drawing the line
as well adds 6 m of gain and 2.6 s, for **5.8 s total**. Waypoint density has an
optimum at roughly one per kilometre and **packing them tighter makes it
dramatically worse** (94 waypoints produced a 47.0 km course against 42.2),
because each snaps to its own nearest way and the router detours between them.
Full tables in `docs/COURSE-RIGHTS.md` §4.

**What shipped, and what was refused**

Eighteen courses: Singapore, Riga, Kobe, Hanoi, Nicosia, Lucerne, Charleroi,
Kaunas, Jungfrau, Polar Circle, Patagonian, Havana, Reggae, Great Limerick,
Warsaw, Ljubljana, Sofia, Geneva. Four came from the organizer's own site
(Warsaw, Ljubljana, Sofia, Geneva); the rest from the goandrace archive. Every
one had its next edition confirmed against the organizer's own site before its
slug was spent. **`--force` was never used.**

Six were refused, and the reasons are the useful part:

- **Izmir** — still-runs check failed. The organizer now lists only a half
  marathon; the 42 km edition appears discontinued.
- **Rotorua** — still runs, but the organizer states the 2027 route reverses to
  anti-clockwise around the lake for the first time in 50 years. The 2024
  geometry would run the profile backwards.
- **Lausanne** — 41.520 km, one metre above the parser floor and 675 m short of
  the distance. That is missing geometry, not a digitising tolerance.
- **Punta Cana** — goandrace's linked map is the 10K (10.005 km).
- **Madrid** (39.759 km) and **San Sebastián** (41.499 km) — both parser-rejected
  on distance, one of them by a single metre. Both are newly *reachable* now the
  sponsor bug is fixed, and both want a better source.

**Source-class hit rate, recorded in `data/import/source-hits.json`:** organizer
(including goandrace's re-hosted organizer files) **11/14 = 79%**; five races
searched honestly with nothing usable found (Porto, Fukuoka, Montreal, Bucharest,
Košice) — every one of them publishes its course as a JPG or PDF, which is
exactly the population `trace.ts` was built for.

**6. The finding that matters most, and it is not what this project set out to
find.** §12 records several courses "badly under-recording climbing" and this
project was supposed to fix them by re-sourcing. Re-sourcing worked and did not
fix them:

| | source GPX gain | 44-point grid | published |
|---|---|---|---|
| New York, old source | 293 ft | 237 ft | 966 ft |
| New York, re-sourced | **896 ft** | **250 ft** | 966 ft |
| California International, old | 112 ft | 48 ft | 663 ft |
| California International, re-sourced | **268 ft** | **86 ft** | 663 ft |

The new New York source reads 896 ft against a published 966 ft — essentially
correct — **and the 44-point array the pacing engine actually reads still says
250 ft.** Swept across the whole catalog, the 44-point grid retains a **median
55%** of its own source GPX's climbing (quartiles 41% / 55% / 69%), and as
little as **10%** on courses whose climbing is many small undulations
(`colorado-marathon`, `three-bridges-run`, `catania-marathon`). Pikes Peak
retains 99%, because its climbing is one enormous monotonic ascent, which is the
one shape a 960 m grid can represent.

**So the under-recorded climbing is structural, not a sourcing defect, and no
amount of re-sourcing will fix it.** 44 points over 42.195 km is one per 959 m,
and a marathon's real climbing happens at 100-300 m. Both courses were
re-sourced anyway, because the new geometry is strictly truer (New York's net
went from -80 ft to -13 ft, which is right for a course that starts and finishes
at similar elevation, and California International's net now sits within 32 ft
of its USATF certificate). But **§12 cannot be closed by re-sourcing**, and the
fix is a denser grid, which reaches into the pacing engine, the schema and
Rule 1. That is a new project, not a bug fix — see the deferred list.

**Jack & Jill was a false alarm.** §9 records it reading -856 ft "against a
published drop near 2,000 ft". The organizer's own published profile is 267 ft
of gain and 1,300 ft of loss, a net of about -1,033 ft, and its source GPX reads
-859 ft. The 2,000 ft figure in §9 is wrong and should not be chased.

**Operational note:** `rm -rf .next` after `npm run db:seed`, as always. Seeded
clean: 336 cities, 344 series, 344 courses, all 18 new rows verified in Neon at
44 elevations, 44 coords and 42,195 m.

**Follow-up 2026-09-25: the tracker is rebuilt from the live calendar, and its
"in-db" count was overstated.** `findmymarathon-tracker.csv` was derived from a
hand-pasted 766-row CSV with four columns. `npm run import:findmymarathon` now
snapshots all 771 races on `calendar-all.php` plus every detail page
(`findmymarathon-calendar.csv`: organizer website, finishers and BQ% by year,
profile, max/min elevation, finish-line coordinate and the rest). The reconciler's
"do we have it" check was name-only and ran *before* its country filter, so all
eight "Bound for Boston" qualifiers counted as Boston, London OH as London, York PA
as New York City, Athens AR/GA/OH as Athens, Greece: about 40 rows claimed as covered
that we do not have. Matching now requires same country and US/CA state, and
findmymarathon's finish line within 25 km of our course; a race over 60 km away never
matches. `inSystem` is `yes` only when the 44-point profile, coords and outline all
exist. Hand rulings live in `data/import/findmymarathon-matches.json`. `rank.ts`
scores findmymarathon's finisher count as reach, and the `/fill-marathon-gaps` skill
works the gap largest-field-first down the goandrace → organizer → trace ladder.

## 24. [ ] Apple Watch per-kilometre pace prompts

**Status:** Not started · **Ease:** ●●●●● · **Hardest by far, and a new platform**

Every kilometre or mile, tell the runner the goal pace for the split they are
entering. This is the plan finally reaching the runner mid-race instead of on a
piece of paper.

**This is a native app, and that is a bigger decision than any project on this
list.** Everything shipped so far is one TypeScript codebase on Vercel. This adds
Swift, Xcode, an Apple Developer account, App Store review, release cycles measured
in days rather than a push, and a second thing to keep working when the pacing model
changes. Rule 7 says app code is TypeScript and scopes its Python exception to a
build-time tool; a watchOS target is a much larger exception and needs the argument
written down the way `docs/UPLOADED-COURSES.md` was written for Rule 6.

**Rule 6 is the sharp constraint.** There is no auth, no accounts and nothing to log
into, so the plan has to get from the website to the watch without an identity.
Precedent exists and it works: an uploaded course is reachable by whoever holds an
unguessable `u-…` link. A plan could travel the same way — a short code or a QR on
`/results` that the watch app redeems against a public read endpoint. **That keeps
Rule 6 intact and should be the design.** Anything that starts with "the user signs
in on the watch" is the wrong branch.

**Three options, cheapest first, and the recommendation is not the watch app**

1. **A structured workout export.** Generate a file with per-split pace targets —
  `.FIT` workout steps for Garmin, or the corresponding Apple format — and let the
   device's own workout screen do the prompting. No app, no review, no second
   codebase, and it reaches Garmin users too, who are the larger share of the
   marathon field. Already on the deferred list below as "PDF and
   .FIT/Garmin export". **Do this first regardless**, because it delivers most of
   the value and it is a pure output format over data the app already computes.
   Caveat to verify: Apple's Workout app does not natively import third-party
   workout files, so this path serves Garmin and third-party iOS apps well and the
   stock Apple Watch experience not at all.
2. **A phone-side PWA with audio cues.** `/results` already holds the whole plan; a
  wake-lock page with the Web Audio and Speech APIs can call splits from the
   runner's pocket without an app store. This is roughly the product FindMyMarathon
   sells at $5.99, and it is also on the deferred list below. Accuracy depends
   on browser geolocation, which is the honest limitation.
3. **A native watchOS app.** The real thing: distance from the watch's own sensors,
  a haptic at each split, the target on the wrist. Also the only option that needs
   all of the platform cost above. Worth it only once 1 or 2 has proven runners
   actually want the plan mid-race.

**Whichever is chosen, two things must hold.** The pace it announces is the pace
`computePaceChart` produced, transferred rather than recalculated on the device —
two implementations of the split arithmetic will diverge and the watch would be the
one the runner believes. And a split boundary crossed by GPS drift must not fire two
prompts; the debouncing is more of the work than it sounds.

**Recommendation: do not start at option 3.** Ship the export, watch whether it gets
used, and let that decide whether a native target is worth opening.

---

## 25. [x] Pace opportunity meter

**Done** 2026-09-22. Phase 4 work, filed here to keep the project numbers in one
ascending run: it extends #16 and belongs beside it in spirit, not beside #24.

`ImpactPanel` ended on a bare figure. The four tiles said where "+6.2%" came from
and nothing on the page said what it meant, which is fine for a reader who already
knows what a grade-adjusted percentage is and useless for everyone else. A
horizontal red-to-green bar now closes the section: a marker positioned on a fixed
scale, and one word, Challenging / Moderate / Favorable.

**It reads the total row and nothing else.** `courseOpportunity` takes the
`ImpactBreakdown` the panel already computed and uses `totalPercent` verbatim. It
does not recompute cost and has no access to anything not already on screen, so
the word can never argue with the number three pixels above it. The alternative,
folding altitude back in so the verdict matched `/courses`, was considered and
rejected for exactly that reason: La Paz would have shown "Challenging" under a
+14.9% total. The consequence is that this inherits #16's documented altitude
omission, and on the 32 courses above 1,000 m the verdict reads kinder than the
all-in figure. Same trade #16 wrote down, not a new one.

**The scale is not linear, and the catalog is why.** Measured over all 326 seeded
courses, the terrain half of the number is savagely lopsided: median +0.74%, 63.8%
at or below +1%, 92% at or below +3%, then a tail to Pikes Peak at +47.1%. A bar
stretched linearly over that range parks every road marathon in the world on one
pixel. So `OPPORTUNITY_ANCHORS` is a piecewise-linear curve that spends its
resolution between -3% and +10%, where real races on real days actually sit, and
compresses the ends only the mountain courses reach.

**It is mostly a weather instrument, and that is correct.** The terrain half is
fixed the moment a runner picks a race; the forecast is the part that moves while
they are looking at it. Heat and humidity are worth about +5% at 25 C and about
+35% at 35 C / 90%, which is far wider than the spread between one flat major and
another. Berlin reads 70 Favorable on a cool morning, 59 Favorable at 18 C, 40
Moderate at 25 C and 10 Challenging at 32 C. Blue Ridge reads Challenging in every
forecast, and REVEL Mt Charleston holds Favorable into warm air.

**The Favorable floor is 55, not 60.** At 60 the flat majors flip to Moderate at
about 17 C, which is a cool morning by marathon standards and plainly still a fast
day. At 55 they hold to about 20 C and turn over at 25 C.

**It reuses the `DifficultyBadge` ramp rather than inventing a second one**, which
required amending the DESIGN.md rule that reserved that ramp for the profile pill.
The argument is in DESIGN.md: both are fast-to-slow scales, so sharing one set of
stops is coherence, and a separate red-amber-green would have been the actual
violation of "nothing new for a second scale". No new tokens, so the existing
ΔE / contrast / hue-monotonicity / dark-saturation fences in
`globals.tokens.test.ts` cover the meter for free. The gradient lives in
`globals.css` as `.opportunity-track`, following the `.hero-scrim` precedent.

**The bar spends the colour and nothing else does.** The verdict word and the tick
are both `--color-text-primary`. The first draft tinted the word to the marker's
stop and it read as two instruments shouting the same thing, which is what
"findable, not loud" exists to prevent. The tick carries a ring in the tile's own
background so it survives both ends of the ramp in both themes without spending a
second colour on itself.

**Colour is not the only carrier.** The track is `role="img"` with an `aria-label`
naming the band and the figure in words, for the same reason the profile pill
pairs each stop with an icon: a green-to-red ramp is what dichromacy compresses
hardest.

- `src/lib/pacing/opportunity.ts` is pure and is **not** on the Minetti path
  (Rule 1 untouched). It consumes an `ImpactBreakdown`; it computes no cost.
- `opportunity.test.ts` pins the shape rather than the taste: monotone across a
  fine sweep, clamped to [0, 100] on absurd input, neutral rather than NaN on a
  broken one, band boundaries exact, plus a sweep over every committed course and
  the named verdicts above. The anchors may be retuned; a worse day scoring better
  may not.
**Audited and recalibrated the same day, and the first cut was wrong twice.**
The question that found it was "at what temperature does a flat marathon change
verdict?", checked against the ground truth already in `src/lib/weather/heat.ts`:
that module documents 13 C as the ideal-conditions threshold and is fitted to
marathon data at heat index 16 / 21 / 27 / 32 C for roughly 1 / 3 / 6 / 10
percent.

- **The bands were far too kind.** Score floors of 55 and 30, picked by taste,
  meant a flat course held "Favorable" to **19.6 C** and did not read
  "Challenging" until **28.2 C** at 60% humidity. 28 C is an 8% slowdown in the
  model underneath and a day races get flagged or cancelled on. It also made the
  word carry almost no information: **291 of 326** courses read Favorable on a
  cool morning. The floors are now *derived* from the heat model's own anchors
  (`OPPORTUNITY_EDGE_PERCENT`, +1% and +6%), so this module has no opinion of its
  own left to drift from the engine's, and a re-fit of those anchors moves the
  bands for free. Flat course now leaves Favorable at 15.9 C and Moderate at
  26.2 C; the cool-day split is 208 / 107 / 11.
- **The word, the pixel and the label disagreed with each other.** The verdict
  flipped at 55, the evenly spaced gradient did not reach green until 86, and the
  three `justify-between` axis labels implied boundaries at 25 and 75. On a cool
  day **82.5% of races rendered "Favorable" over a yellow pixel sitting under the
  label "Moderate"** — the exact failure the bar existed to prevent. Both are now
  derived from the thresholds: stops pinned to the band edges, labels positioned
  over band centres. The gap between the word turning Favorable and the pixel
  turning green went from 21.3 points to -2.4, and the contradiction rate to 0%.
  Two tests in `OpportunityMeter.test.tsx` parse `globals.css` and the rendered
  label positions to stop all three drifting apart again.

- **Not done:** the meter does not appear on `/courses` or `/compare`. Both would
  want the all-in figure including altitude, which is a different number from this
  one, and shipping the same bar reading two different scales is the confusion
  this project set out to avoid.

---



# Inherited, still open

Threads left open by projects 1-12 that bear on the work above. Full context is in
the numbered section cited, earlier in this file.

- **Should the altitude penalty extend the finish time?** (§7.) Weather
already pushes the finish past the goal; altitude does not, so `/compare` and the
pace chart disagree for the 32 courses above 1,000 m. **#16 did not resolve it, and
ended up not surfacing it either**: the impact panel briefly carried an Altitude
line labelled as a comparison cost, and the tile was cut because it read 0.0%
almost everywhere. So the splits are still not charged for altitude, nothing on
/results mentions altitude at all, and /courses still ranks with it folded in.
Resolving it means applying altitude after normalization, which changes the
headline finish for those 32 courses. A project of its own, and the trigger for it
is high-altitude races mattering to the catalogue rather than anything in the UI.
- **Dew-point-based heat model** (§4b). Worth weighing against the Running
Writings curve, fit to 3,891 marathoners across 754 races, versus our
hand-anchored piecewise NWS line. A model change with its own tests. #14 and #16
both display what this model produces, so it is more visible after they ship.
- **Boston qualifier statistics blocked on results-data rights** (§9c). The
blocker is legal, not technical. Do not start without settling it.
- **Goal as Pace or GAP is switched off** behind `GOAL_INPUT_MODES_ENABLED` in
`src/lib/featureFlags.ts` — the dashboard sidebar could not carry it beside the
km/mi toggle. Code and tests stay live; re-enable when the goal row has somewhere
roomier, not by squeezing it back in.
- **Course cost from the dense profile** rather than the 44-point array (§12):
measured at R² 0.935 against 0.925. Deferred because it needs a stored,
seed-time column that can drift from the code. **Related to #13's resolution
decision** — if the dense profile ever becomes a first-class stored input, both
change together.
- **~~Several source GPX files under-record climbing~~ — the 44-POINT GRID
under-records climbing** (§12). **#23 tried to fix this by re-sourcing and
proved it cannot be.** New York re-sourced from 293 ft of source gain to 896 ft
against a published 966 ft, and the 44-point array the pacing engine reads still
says 250 ft. Swept across the catalog, **the 44-point grid retains a median 55%
of its own source GPX's climbing** (quartiles 41% / 55% / 69%; as little as 10%
on `colorado-marathon` and `three-bridges-run`; 99% on Pikes Peak, whose
climbing is one monotonic ascent). 44 points over 42.195 km is one per 959 m and
a marathon's climbing happens at 100-300 m. The fix is a denser grid, which
reaches the pacing engine, the schema, the seed path and Rule 1, so it is a
project and not a bug fix. **It is the same resolution decision as the dense
`profile` bullet above and #13's; all three should move together or not at all.**
- **Refreshing** `/results` **returns the arrival state, not the edited one** (§11).
Accepted deliberately; the fix, if it ever bites, is session persistence for
the dashboard form.



# Explicitly deferred

Gaps found in the competitive audit that are **not** on this roadmap, recorded so
they are not rediscovered from scratch:

- **Blocked by Rule 6 (no auth):** saved plans and history, coach rosters and
  multi-athlete plans, pace-team bulk ordering, race-organizer course admin.
- **Not yet prioritized:** race-time prediction from a recent result (Riegel/VDOT);
  half marathon and other distances (the largest single market expansion, but
  42.195 km and the 44-point array are load-bearing throughout); PDF and .FIT/Garmin
  export; a live phone pace band with voice prompts (FindMyMarathon sells one at
  $5.99); paceband SKU variants; 5K/checkpoint split views; fluid, sodium and
  caffeine in the fueling plan; aid-station waypoints; finer segmentation
  (elevation-change splits); surface and turn costs; post-race plan-vs-actual analysis.
- **A 14-day forecast horizon (#18)** — deferred 2026-09-21. Two independent
  blockers. **Provider:** Tomorrow.io's hourly timeline reaches about 120 hours, so
  the claim cannot be made against the current one at all. **Licence, which is the
  real blocker and is commercial, not technical:** the only provider already in this
  stack that reaches 16 days is Open-Meteo, and `OPEN_METEO_API_KEY` is unset, so the
  route calls its free public endpoints, which are licensed for non-commercial use.
  Pacebands are a paid product. Extending the horizon would move Open-Meteo from
  covering the edges to serving the most-viewed case there is, making that materially
  worse rather than unchanged. Reopen only with a commercial plan (setting the key
  already switches the route to the `customer-*` hostnames) or a self-hosted instance
  under the AGPL. When it reopens, the work is `FORECAST_HORIZON_DAYS` in
  `src/lib/weather/horizon.ts` plus a fourth branch in `/api/weather`; the calendar
  follows with no edit, and §18's own section records the rest of the design,
  including whether `WeatherSource` should grow an "outlook" value so a day-12 number
  is not presented as a day-2 one.
- **Evaluated and declined:** a fatigue / drift model. Late-race slowing is real but is
  mostly a *consequence* of starting too fast, and the fastest strategy is even-to-slightly-
  negative — so prescribing a fade would work against the goal. Projects #1 and #2 give the
  runner that control directly. Do not reopen without new evidence.
- **Refreshing `/results` returns the arrival state, not the edited one** (from #11,
  2026-09-17). The address bar is frozen at whatever the page loaded with, so a
  reload discards subsequent edits. Accepted deliberately: the alternative,
  stripping the query after load, makes a refresh land on the "Missing or unknown
  course" error page, since `courseId` is required. The fix if it ever bites is
  session persistence for the dashboard form, extending the precedence already in
  `lib/editions.ts` (URL wins, then the stored snapshot, then defaults) rather than
  overturning it. `InputForm` deliberately does not set `persist` on the dashboard
  today, and that is the line to change.
- **Already computed but never shown:** the hourly weather series across the race —
  the math consumes it, the UI never charts it. Cheap and differentiating.
  **#14 closes this**; strike the bullet when that project ships.
- **Goal stated as Pace or GAP**, switched off on 2026-09-17 behind
  `GOAL_INPUT_MODES_ENABLED` in `src/lib/featureFlags.ts`. Not a retreat from the
  feature: the dashboard sidebar could not carry the Time/Pace/GAP control and the
  km/mi toggle on one line without them crowding each other, and the goal mode is
  the one of the two a runner can do without, since every mode collapses to the
  same `goalTimeSeconds` before it reaches the engine or a shared link. The code
  and its full test suite stay live (`InputForm.goalMode.test.tsx` mocks the flag
  on), so re-enabling is one constant. Re-enable once the goal row has somewhere
  roomier to put it, not by squeezing it back in.

- **findmymarathon's other two course axes**, deliberately not adopted alongside
  its profile taxonomy on 2026-09-08. **Course Type** (Loop / Mostly Loop /
  Multi-Loop / Out & Back / Mostly Out & Back / Multi Out & Back / Point to
  Point) is derivable in principle from the stored `coords` array — start/finish
  proximity plus self-intersection — but nothing in the app reads it today.
  **Surface** (Road / Mostly Road / Trail / Mostly Trail) is **not derivable at
  all**: it is nowhere in GPX and would need a per-course human field, i.e. the
  same sign-off burden as `organizer` and for the same reason it is still null.
  Neither blocks anything; note them here rather than half-building them.
  **#21's outline column would make Course Type nearly free**, since start/finish
  proximity and self-intersection are exactly what a simplified polyline answers.

- **Course cost from the dense profile rather than the 44-point array** (from #12,
  2026-09-18; **numbers corrected 2026-09-20** after an independent re-measurement
  failed to reproduce them). Resampling `*.profile.json` **at 500 m does not help**:
  it scores R² 0.9235 against FindMyMarathon's Course Scores and 77 s RMS on a
  4-hour conversion, against the shipped 44-point array's 0.9246 and 76 s. The
  spacing that helps is **1 km**: R² 0.9330, and 0.9297 under leave-one-out
  cross-validation against the 44-point array's 0.9156, dropping RMS from 76 s to
  72 s. Two traps for whoever picks this up:
  - **Finer is worse, not better.** 250 m scores 0.9090. Below about a kilometre,
    digitization noise in the source track reads as real climbing, and because the
    cost curve is asymmetric that noise is charged at `k_up` and never refunded.
    One kilometre is roughly where the noise stops dominating and real terrain
    starts, which is the same scale the 44-point array already works at.
  - **Normalise by the profile's own measured length, not by 42.195.** Dividing
    the summed cost by the marathon distance instead of by the track's own length
    lets digitization over-measurement leak straight into the multiplier and
    collapses the fit to ~0.85 at either spacing.

  Still deferred, and the 4 s it is worth on a 4-hour conversion is why: it needs a
  stored, seed-time-computed column (the catalog must not select `profile`, which
  is 7-48 KB per row), and a derived value in the database can drift from the code
  that defines it. Revisit together with the item below, which is the larger error
  of the two.
- **Several source GPX files badly under-record climbing** (from #12,
  2026-09-18). Our 44-point arrays retain between 7% and 53% of FindMyMarathon's
  surveyed elevation gain, and the ratio varies per course rather than being a
  constant we could calibrate out. New York is the worst of the majors: 293 ft of
  gain in the source GPX against FMM's 966 ft, because the bridge climbs are
  smoothed away before the parser ever sees them, and it stays the largest
  road-course residual in the fit (-184 s on a 4-hour conversion) after the model
  was corrected. California International is more extreme still at 112 ft against
  663 ft. Part of what `k_up = 1.95` is doing is standing in for climbing the data
  never recorded, which is the honest reason that coefficient is above 1. ~~The fix
  is re-sourcing individual GPX files, not a model change.~~

  **Amended 2026-09-25 (#23): re-sourcing is not the fix, and this was tested
  rather than argued.** New York was re-sourced to a GPX reading **896 ft** of
  gain against FMM's 966 ft — essentially correct — and its 44-point array still
  reads 250 ft. California International went 112 -> 268 ft at source and 48 ->
  86 ft on the grid. The loss is the resample, not the source: **across the whole
  catalog the 44-point array retains a median 55% of its own source GPX's
  climbing** (quartiles 41% / 55% / 69%, floor ~10%, and 99% only on Pikes Peak
  where the climbing is one monotonic ascent). Both courses were re-sourced
  anyway because the new geometry is truer in every other respect, but the
  remaining gap belongs to the grid. See the deferred list: this is the same
  resolution decision as the dense-`profile` cost model and #13, and `k_up`
  should not be re-fitted until it is settled, because it is currently absorbing
  a resolution artefact.
