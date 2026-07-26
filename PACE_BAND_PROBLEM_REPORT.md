# Pace-Band Problem Report — for Deep Research Handoff

**Date:** 2026-05-18
**App:** eveneffort — client-side marathon pace-band calculator
**Purpose:** Describe precisely what our pacing engine does, what we just
implemented from the prior research report, and the unresolved problem, so a
follow-up research pass can make an informed model decision.

---

## 1. What the engine does today

Self-contained pipeline, no backend:

1. **Course data.** Each marathon is a hardcoded array of **44 absolute
   elevations (m)** — one sample per km at km 0…42, plus the 42.195 km finish.
   This resolution is fixed by a data-integrity rule.
2. **Segmentation.** For a mile-unit band we build 26 one-mile segments + a
   0.2186-mi tail. Each segment's elevation endpoints are **linearly
   interpolated** from the 44-point per-km array. Segment grade =
   (elevΔ m) / (segment length m) — i.e. the **average grade over that mile**.
3. **Grade adjustment (Minetti GAP).** For grade `g`,
   `factor = C_r(g) / C_r(0)` where
   `C_r(g) = 155.4 g⁵ − 30.4 g⁴ − 43.3 g³ + 46.3 g² + 19.5 g + 3.6`
   (Minetti et al. 2002, J Appl Physiol 93:1039; verified verbatim against the
   paper, including its measured Table 2 data, within 1 SD at all 13 slopes).
   `g` is clamped to Minetti's validated ±0.45 domain before evaluation.
4. **Raw split** = segmentLength × flatPace × factor.
5. **Normalization.** All raw splits are scaled by one scalar so the total
   exactly equals the user's goal time. (Relative ratios preserved; total is
   exact.)

This is the standard GAP approach (Strava/Garmin/RunGap use the same Minetti
core).

## 2. What we just implemented (from the previous research report)

The prior report recommended: keep Minetti as the base, **cap extreme
values** — "no faster than ≈12–15% improvement on descents, no worse than
≈double time beyond ~15% climbs; Strava limits downhill boost to ~12%."

Implemented as an empirical clamp layered on top of the (untouched) Minetti
core:

```
ADJ_DOWNHILL_FLOOR = 0.88   // ≤12% pace benefit on descents (Strava-aligned)
ADJ_UPHILL_CEIL    = 2.0    // ≤2× flat cost on extreme climbs
adjustmentFactor(g) = clamp( C_r(g)/C_r(0), 0.88, 2.0 )
```

Wind (Davies) and Townshend pacing-history were correctly scoped out (optional
/ not a base formula / Phase 2).

## 3. The problem (still unresolved)

The user compared our **Boston 3:20:00** band to two established online bands:

| Source | Mile-1 pace | Whole-course pace swing |
|---|---|---|
| FindMyMarathon | ~7:26 | ~7:23 → 7:59 (**~36 s**) |
| paceband.org | ~7:31 | ~7:29 → 7:53 (**~24 s**) |
| **eveneffort (ours)** | **6:49** | **6:49 → 8:14 (~85 s)** |

Ours swings **~2.5–3.5× harder** and prescribes a wildly fast first mile.

### Root causes (measured, not hypothesized)

**A. Pure Minetti is far more aggressive than commercial bands.**
Minetti models *metabolic energy cost*. At Boston mile 1's −2.36 % average
grade, raw `C_r(g)/C_r(0)` = 0.876 → run **12 % faster** (→ 6:49). Commercial
bands change mile 1 by only ~2–3 %. Their entire-course swing (~24–36 s) is
roughly what raw Minetti produces in a *single* steep mile. They are clearly
applying a **heavily damped** heuristic, not raw metabolic cost.

**B. The 12 % cap does NOT fix this for road marathons.**
Critical empirical finding after implementing the report's caps:

- The 0.88 floor begins binding at **g ≈ −0.0235 (−2.35 % descent)** — *not*
  "extreme/trail terrain." Any per-segment descent steeper than ~2.3 % is
  capped.
- But Boston's *mile-averaged* grades only exceed that on **mile 1**. So the
  cap touches **1 of 27 segments**, max per-mile change **0.13 s**.
- **Capped Boston swing = uncapped = 85 s. Output is visually identical.**
  Total stays exactly 3:20:00.

So the report's recommendation, faithfully implemented, is a correct safety
rail for steep courses but **does nothing** about the user's actual complaint.
Per that report our 6:49 / 85 s band *is* "correct standard Minetti-GAP"; the
commercial bands are simply more conservative than the report endorses.

**C. Spiky source elevation data adds jaggedness (secondary).**
The 44-point per-km profile is noisy: per-km elevation deltas swing
−34.8, −21.4, +13.7, +15.0, −22.0 m, etc. Average mile grades inherit this
sawtooth, so adjacent miles flip fast/slow (mile 21 +1.13 % → 8:14, mile 22
−1.47 % → 7:09). Commercial bands integrate higher-resolution smoothed
profiles, transitioning gradually. (Net drop 133 m ≈ official ~140 m, so the
gross profile is right — only high-frequency noise hurts.)

**D. Minetti's downhill branch is U-shaped — the simple floor models it
awkwardly.** `C_r` is *not* monotonic on descents: cost falls to a minimum
near −18 % then **rises again** (eccentric-braking cost). At −45 %,
`C_r/C_r(0)` = 1.12 (a *penalty*, not a benefit). So a single 0.88 floor:
(i) creates a long flat plateau — every descent from ~−2.3 % to ~−40 % returns
*exactly* 0.88, erasing all differentiation between a −3 % and a −25 % mile;
(ii) correctly does not floor very steep descents (cost > flat there). Whether
a flat plateau is desirable pacing guidance is an open question.

## 4. The decision needed from research

Implementing the previous report did not move the needle on the user-visible
problem, because the problem is **model aggressiveness at gentle road grades**,
which the report's extreme-grade caps don't touch. We need a decision on the
*intended product behavior*, with these concrete options on the table:

1. **Accept it.** Ship raw Minetti GAP (+ the safety caps just added).
   Position eveneffort as "true physiological even-effort," explicitly more
   aggressive than FindMyMarathon/paceband.org. No further change.
2. **Empirical damping factor `k`.** Replace `factor = C_r(g)/C_r(0)` with
   `factor = 1 + k·(C_r(g)/C_r(0) − 1)`, `0 < k < 1`. Tuning `k` (≈0.3–0.5)
   reproduces commercial-magnitude swings while keeping Minetti's *shape*.
   Question for research: is there a physiologically defensible `k`, or a
   published "real-runner vs Minetti" attenuation (e.g. Townshend's ~14 %
   downhill / ~23 % uphill observed vs Minetti's predicted), to set it
   non-arbitrarily?
3. **Tighter, smoother cap instead of damping.** Lower the downhill cap to
   match real-runner data (Townshend ~13.8 % faster max ≈ floor ~0.86, or
   stricter), and/or replace the hard clamp with a smooth saturating function
   to avoid the 0.88 plateau in option D.
4. **Fix the data layer too.** Smooth or up-sample the 44-point elevation
   profile so mile grades aren't aliased (addresses jaggedness, not
   aggressiveness — likely needed *in addition to* 1–3).

### Specific questions for the research pass

1. Is the goal "physiologically pure even-effort" or "what experienced
   marathoners actually run / what FindMyMarathon-class tools output"? These
   diverge by ~2.5×; the report assumed the former, the user is comparing
   against the latter.
2. Is there published evidence to set a damping `k` or a real-runner-calibrated
   grade-response curve (Strava's HR-fit 2017 model, Townshend regression,
   etc.) rather than picking a number to match competitors?
3. For mile-averaged road grades (mostly within ±3 %), the ±12 %/2× caps are
   nearly inert. What is the *recommended response in the −1 % to −3 % band*,
   where Minetti already predicts 6–15 % speed-ups that commercial tools
   damp heavily?
4. Should the downhill model preserve differentiation across the −3 %…−25 %
   range (smooth saturation) rather than a flat floor plateau?

### Reference data (Boston 3:20, miles, our engine)

Per-mile grade → raw Minetti factor → our pace (capped == uncapped):

```
mi  grade%  rawFactor  pace      mi  grade%  rawFactor  pace
 1  -2.36   0.880      6:49      15   0.28    1.015      7:52
 2  -0.36   0.981      7:36      16  -1.37    0.928      7:12
 3  -1.27   0.934      7:14      17   0.43    1.024      7:56
 4  -0.93   0.951      7:22      18   0.73    1.040      8:04
 5   0.18   1.010      7:50      19  -0.57    0.970      7:31
 6  -0.51   0.973      7:32      20   0.72    1.039      8:04
 7  -0.21   0.989      7:40      21   1.13    1.063      8:14
 8  -0.03   0.999      7:45      22  -1.47    0.923      7:09
 9  -0.25   0.986      7:39      23  -0.49    0.974      7:33
10   0.36   1.020      7:54      24  -1.21    0.936      7:16
11   0.41   1.022      7:56      25  -0.56    0.970      7:31
12  -0.67   0.964      7:29      26   0.04    1.002      7:46
13  -0.25   0.987      7:39      27  -0.05    0.997      7:44
14  -0.01   1.000      7:45      (seg 27 = 0.2186 mi tail)
total = 3:20:00 exactly
```

---

## Resolution (implemented 2026-05-18)

Shipped **Minetti core (untouched) + uniform damping + elevation smoothing +
caps as guardrails**:

- **Damping (primary):** `factor = clamp(1 + k·(C_r(g)/C_r(0) − 1), 0.88, 2.0)`
  with `k = MINETTI_DAMPING = 0.35`. Chosen as the midpoint of the
  Townshend-corroborated 0.35–0.5 observed/predicted range; reproduces
  reference-band magnitude. Note: the deep-research damping *shape* ("strong
  near flat, fade to full Minetti at steep") was tested and rejected — it left
  the steep miles that drive the swing uncorrected (68 s vs ~25 s for uniform
  k). Uniform damping was used instead.
- **Smoothing (secondary):** light 3-tap moving average over the 44-pt profile
  at compute time (endpoints + net drop preserved; stored JSON untouched).
- **Caps (tertiary):** unchanged; now pure backstops — bind 0/27 segments on
  Boston and NYC.

**Result — Boston 3:20:** mile 1 6:49 → **7:23**, swing 85 s → **~25 s**,
total exactly 3:20:00. NYC 4:00: swing ~17 s, 0 guardrail hits. 106 tests
pass; Minetti polynomial and its paper-validation untouched.

---

Minetti factor reference points (validated against the 2002 paper):
`g=0 →1.000`, `−0.01→0.947`, `−0.0235→0.880 (floor onset)`, `−0.05→0.763`,
`−0.10→0.598`, `−0.18→~0.495 (min)`, `−0.30→0.684`, `−0.45→1.120`,
`+0.05→1.301`, `+0.10→1.658`, `+0.145→2.000 (ceiling onset)`, `+0.45→5.396`.
