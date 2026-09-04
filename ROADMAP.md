# eveneffort — Product Roadmap

**Goal:** the world's most advanced course-specific pacing calculator. No mainstream
calculator should have a feature eveneffort lacks.

This file is the tracker. **It is updated as part of every project's commit** — see
Rule 10 in CLAUDE.md. A project is not done until its row here says so.

Projects are ordered by **technical ease**, easiest first, so the cheapest wins ship
first. Ease is judged on: does it touch the schema, does it need new data, does it
need new human research, and does it touch the locked pacing algorithm.

## Status board

| # | Project | Phase | Ease | Status |
|---|---------|-------|------|--------|
| 1 | Split strategy (negative / positive, aggressive variants) | 1 | ●○○○○ | **Done** 2026-08-30 |
| 2 | Conservative start options | 1 | ●○○○○ | **Done** 2026-08-30 |
| 3 | Goal as pace or GAP pace | 1 | ●●○○○ | **Done** 2026-08-30 |
| 4 | Dew point as the humidity input | 1 | ●●○○○ | **4a done** 2026-08-30 · 4b deferred |
| 5 | Course difficulty rating + fastest-course ranking | 2 | ●○○○○ | **Done** 2026-08-30 |
| 6 | Nav restructure (tools in the navbar) | 2 | ●●○○○ | **Done** 2026-08-31 |
| 7 | Altitude penalty | 2 | ●●●○○ | Not started |
| 8 | Race comparison / time conversion calculator | 2 | ●●○○○ | **Done** 2026-09-04 |
| 9 | Boston qualifier standards + per-race BQ status | 3 | ●●●●○ | **9a + 9b done** 2026-09-04 · 9c blocked |
| 10 | Bring your own course (GPX / KML / Strava upload) | 3 | ●●●●● | **Done** 2026-09-04 |

---

# Phase 1 — pure math and form work

No schema change, no new data, no new research. All four are confined to
`src/lib/pacing/`, `src/lib/weather/`, `src/components/InputForm.tsx` and
`src/lib/resultsParams.ts`.

## 1. Split strategy — negative / positive, with aggressive variants

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

## 2. Conservative start options

**Status:** Done 2026-08-30 · **Ease:** ●○○○○

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

## 3. Goal expressed as pace or normalized (GAP) pace

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

Still deliberately **not** in scope: race-time prediction from a recent result
(Riegel/VDOT). Separate project, different claim.

## 4. Dew point as the humidity input

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

## 5. Course difficulty rating + fastest-course ranking

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
  exact. This drives the flat / rolling / hilly / mountainous label.
- **Speed** — `effortMultiplier`, unchanged from #3. This drives the ranking and
  is what #8 will convert times with.

Boston is the case that proves both are needed: it climbs enough to be
**rolling** and still runs **0.6% faster than flat**, because the net drop more
than pays for the Newton hills. One number cannot say that.

**The bands are 75 / 150 / 400 m of gain**, splitting the catalog 133 / 120 / 56
/ 17. They were calibrated against races whose character is not in dispute, not
against round numbers: at a 100 m floor Boston came out "flat" (96 m), which no
one who has run the Newton hills would accept. Berlin 28 m and London 63 m are
flat, Boston 96 and Tokyo 129 rolling, Sydney 190 and Big Sur 270 hilly, Blue
Ridge 727 and Pikes Peak 2,350 mountainous. A separate net-downhill pill (≤ −100
m, 27 courses) carries what the gain band cannot: REVEL Mt Charleston climbs 8 m
and drops 1,549.

**No palette was added.** `DifficultyBadge` extends the two reserved semantics
already in the system — red for the uphill direction, green for faster — and
leaves flat/rolling in neutral text. DESIGN.md records the extension and why a
difficulty ramp was refused.

**Also shipped:** `/courses`, the sortable ranking (speed, climbing, net change,
name), linked from the nav, the footer and the Course Library band, and in the
sitemap. `metresToFeet` moved to
[src/lib/units/elevation.ts](src/lib/units/elevation.ts), out of two copies in
ElevationChart and its test.

**Narrowed deliberately:** the badge is on the results header only. The course
picker, the race calendar and the map popups were dropped — the calendar would
need a courseId→terrain map threaded in from the home page, since
`EditionSummary` carries no geometry, and 326 badges on date chips is noise, not
information.

## 6. Nav restructure — put the tools in the navbar

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

## 7. Altitude penalty

**Status:** Not started · **Ease:** ●●●○○

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

## 8. Race comparison / time conversion calculator

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
answers with the equal-effort time at the other race, plus — beyond the plan —
**that time converted across the whole catalog** in a sortable, filterable
table. The pair conversion was as cheap as predicted, so the catalog view came
almost free on top of it, and it is the half no competitor can reproduce.

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
"0:05:22" repeated down 326 rows reads as a duration rather than a difference.

**Deliberately not done:** the weather layer, exactly as this section says to
defer it. The page states plainly that it converts terrain only.

---

# Phase 3 — new data or new architecture

## 9. Boston qualifier standards + per-race BQ status

**Status:** 9a + 9b done 2026-09-04 · 9c still blocked · **Ease:** ●●●●○

Shipped as `/boston-qualifier` plus a verdict strip on the results page, over one
pure module in [src/lib/bq/](src/lib/bq/). **No schema change, no migration, no
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
2. **Known data gap: Jack & Jill's Downhill reads −856 ft** in our geometry
   (777 m → 516 m; the dense 1,274-point profile agrees, so the source route is
   wrong, not the 44-point resample) against a published drop near 2,000 ft. It
   is exactly the kind of race this rule targets and we currently index it at
   zero. Only better geometry fixes it — see the adopt pipeline.
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

## 10. Bring your own course — GPX / KML / Strava upload

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
- **Evaluated and declined:** a fatigue / drift model. Late-race slowing is real but is
  mostly a *consequence* of starting too fast, and the fastest strategy is even-to-slightly-
  negative — so prescribing a fade would work against the goal. Projects #1 and #2 give the
  runner that control directly. Do not reopen without new evidence.
- **Already computed but never shown:** the hourly weather series across the race —
  the math consumes it, the UI never charts it. Cheap and differentiating.
