# Uploaded courses

The design record for ROADMAP #10 — "bring your own course". Written because
that project is the one that forces a decision against CLAUDE.md Rule 6, and a
decision like that should be argued somewhere durable rather than inferred from
a diff.

Shipped 2026-09-04.

## What it does

A runner uploads a GPX, KML, KMZ or GeoJSON route at `/upload`. They get back an
ordinary `/results` link — the same chart, the same weather model, the same
printable paceband, the same order button as any of the 326 seeded courses.

## The one idea that made it small

`COURSE_SLUG_RE` in `src/lib/resultsParams.ts` is `/^[a-z0-9][a-z0-9-]{0,63}$/`.

A token shaped `u-<22 lowercase alphanumerics>` satisfies it. So an uploaded
course id travels through `/results?courseId=…`, `buildResultsQuery`,
`parseResultsParams` and the whole `/api/checkout` validation ladder **without
any of them changing**. Exactly one function learned about uploads:

```
getCourseBySlug(slug)          src/db/queries.ts
  ├─ slug starts with "u-"  →  readUserCourse()      (uncached)
  └─ otherwise              →  getSeededCourseBySlug (unstable_cache, 1h)
```

That function was already the single existence proof for a course id — the
results page renders an error when it returns null, and checkout refuses to
charge. Teaching it one branch gave uploads the entire downstream product.

The upload branch sits **outside** the cache on purpose. A course uploaded
seconds ago has to resolve on the very next request, and it is not part of the
catalog the `course-catalog` tag invalidates.

## The three decisions the roadmap said to make first

### 1. The resampler: ported to TypeScript

`scripts/gpx_parser/parse_gpx.py` produces the 44-point array the pacing engine
reads. Rule 7 says app code is TypeScript, and a Python runtime on Vercel is a
real deployment change. So the resampler was ported: `src/lib/course/resample.ts`.

The Python is unchanged and remains the build-time tool for the seeded catalog.
Two implementations of one algorithm drift unless something stops them, and
`src/lib/course/conformance.test.ts` is that something: it re-derives real
committed courses from their committed source GPX and asserts the three arrays
are **byte-identical** to the JSON the Python wrote. Twelve courses are pinned in
the test, chosen for the failure modes they can expose (Gothenburg for the 4 dp
profile collision, Palma and Riyadh for the distance ceiling, Chicago for the
largest legitimate point gap, Pikes Peak and REVEL for the extremes).

A full sweep at porting time reproduced **all 326 courses byte-identically**,
with zero mismatches and zero parse failures.

The hazard worth recording: **Python's `round()` is round-half-to-even; JS
`toFixed` is round-half-away-from-zero.** They agree except at exact binary
ties, and those are reachable — a smoothed elevation is a mean of one-decimal
readings, so `66.25` turns up, and Python writes `66.2` where `toFixed` writes
`66.3`. One such point would fail conformance. Hence `roundHalfEven()`.

If conformance ever fails, `resample.ts` is wrong. Not the constants, and never
the committed course data.

### 2. Storage: a `user_course` table, and what that does to Rule 6

Rule 6 said "no authentication… no user-owned data — every row in the database
is public read-only". Uploads cannot be true to the second half of that. The
options were:

| | verdict |
|---|---|
| Ephemeral, in-session only | Rejected. Breaks the shareable `/results` URL, which is a core property of the product, and makes a paceband order impossible because checkout could not validate the course. |
| Geometry encoded in the URL | Rejected. 44 elevations plus 44 coordinate pairs plus a dense profile is far past any practical URL. |
| **A `user_course` table keyed by a random token** | **Chosen.** |

What Rule 6 actually protects is that there are no accounts, no login, no
session, and no per-user data to leak, secure or delete on request. **All of
that still holds.** A `user_course` row is not *owned* by anybody: it is
reachable by whoever holds the link, the way an unlisted document is. There is
no identity attached to it and nothing to log in to.

What genuinely changed: the database now holds content a member of the public
supplied. The bounds on that are:

- **2 MB** per file, checked before parsing.
- **10 uploads per hour** per client.
- The course must parse as a single-track route of **41.5–43.6 km** with at
  least 100 points, or it is refused.
- Only geometry is stored. The one free-text field is the course name, which is
  length-capped at 40 and stripped of control characters and bidi overrides.
- **90-day retention** by default.

### 3. Pacebands: yes, and paying is what makes a course permanent

Rule 8 exists because pacebands are printed on paper and a printed link can
never be reached to fix. An expiring course id and a printed band are therefore
in direct conflict.

The resolution is that `/api/checkout` clears `expires_at` **before** creating
the Stripe session. Paying is what buys permanence. `makeUserCoursePermanent`
throws rather than swallowing its errors — the one runtime write in this app
that does — because if we cannot promise the link will resolve, the honest
outcome is to fail the order rather than take the money and hope. The route
turns that into a 502 and no Stripe session is ever created.

The cost of that ordering is that an abandoned checkout leaves a course
permanent for free. That is the right side to be wrong on, and it is bounded by
the upload rate limit.

The runner's own course name flows onto the printed band through the
`courseName` prop `PaceBand` already had, and into the Stripe metadata that is
the entire order-intake record. That is why the 40-character cap and the
character stripping are not cosmetic.

## Elevation: surveyed vs modelled

Surveyed elevation always wins. When a file carries none — common for
hand-drawn KML — elevation is sampled from a DEM.

The import pipeline queries the model at every track point: ~3,000 points, ~30
sequential rate-limited requests, ~30 seconds. A runner is holding an open
request, so the upload route samples a **~100 m-decimated track** instead
(~423 points, ~4 batches, ~4 seconds) and interpolates back
(`src/lib/course/decimate.ts`). Sampling density is not what limits this number
— reading the ground instead of the road is, and bridges dominate the error by
a wide margin (see the calibration note in `src/lib/course/elevate.ts`).

Modelled elevation is tagged `dem:<dataset>`, never conflated with surveyed, and
disclosed to the runner by `UploadedCourseNotice` — the same distinction
`scripts/import/qa.ts` draws before spending a permanent slug.

## The privacy departure, stated plainly

`weather_window`'s header says its rows "carry nothing about who asked".
`user_course.creator_hash` does: a salted SHA-256 of the client IP.

It exists only as the rate-limit key. An unauthenticated route that writes rows
and calls a metered third-party API needs some bound, and this is the least
identifying one that works. It is never displayed, never joined to anything, and
salted with `UPLOAD_HASH_SALT` so the column is not a rainbow table of the IPv4
space. It is disclosed in `/terms`.

## Files

| | |
|---|---|
| `src/lib/course/resample.ts` | the ported 44-point resampler |
| `src/lib/course/conformance.test.ts` | proves the port against committed courses |
| `src/lib/course/routeFile.ts`, `dem.ts`, `elevate.ts` | moved out of `scripts/import/`, which keeps re-export shims |
| `src/lib/course/decimate.ts` | the fast DEM path |
| `src/lib/course/uploadRules.ts` | size caps, name sanitising, client hashing |
| `src/db/schema.ts` | the `user_course` table |
| `src/db/userCourses.ts` | reads, writes, token generation, the permanence promotion |
| `src/app/api/courses/upload/route.ts` | the validation ladder |
| `src/app/upload/page.tsx`, `src/components/CourseUpload.tsx` | the UI |
| `src/components/UploadedCourseNotice.tsx` | the elevation and expiry disclosure |

## Deliberately not done

- **No sweeper.** Expiry is enforced at read time, following `weather_window`.
  Lapsed rows are simply never selected. If the table grows enough to matter,
  `user_course_expires_idx` is already there for a delete job.
- **No geocoding.** An uploaded course has no city, region or country, because
  nobody told us where it is and there is no coordinate-to-timezone or
  coordinate-to-country data in this repo. The timezone is the browser's own,
  validated, falling back to UTC. Right for the common case and wrong only for
  a start time on a course uploaded from another continent.
- **Uploads never enter the catalog.** They do not appear in the course picker,
  the map, `/courses` or `/compare`, and `/upload` is in the sitemap while an
  uploaded course never is.
- **No Strava OAuth**, despite the roadmap title. Strava can export a route as
  GPX and that file is accepted; an API integration would need the accounts
  Rule 6 refuses.
