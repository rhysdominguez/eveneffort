# Where course geometry comes from, and what we rely on

The rights record for ROADMAP #23 — "systematic sweep of the races we do not
have". Written because #23 is the project that takes the catalog from 326
courses toward a thousand, and `CLAUDE.md`'s standing note that "rights are
unsettled" stops being a footnote at that scale. Pacebands are paid product: a
runner gives us money for a plan computed from this geometry.

Same purpose as `docs/UPLOADED-COURSES.md` — argue the decision somewhere
durable rather than leave it to be inferred from a diff.

Written 2026-09-23. Every claim below was checked on that date, and the check is
named so it can be repeated rather than believed.

## The policy, in one paragraph

**New courses are sourced from the party that owns the route — the race
organizer — or from geometry we derive ourselves.** Route-sharing hosts, where
the geometry is some third runner's upload and the terms are silent or hostile,
are not admissible for a paid batch and `adopt.ts` now refuses them unless a
human passes `--allow-route-host` and says why. This does not retroactively
change the 326 courses already shipped; it governs everything added from here.

## The source classes

### 1. The organizer's own site — admissible, and the preferred class

The race publishes a `.gpx`, `.kml` or GeoJSON of its own course on its own
site, usually from a course-info page. This is the party that actually owns the
route, that measured it, and that wants runners to have it.

This is not a grant of reuse and we should not pretend it is. What it is: the
cleanest available story, the one a reasonable organizer would recognise as
fair, and the one where a takedown request has an obvious address to arrive
from. `adoptions.json` records the URL and the retrieval date for every one, so
any course can be traced back to what was published and when.

`routeSource: "organizer"`.

### 2. Course certification bodies — admissible, but **not** as geometry

This class was expected to be a geometry source. **It is not, and the sweep
should not be planned as though it is.**

USATF's course-measurement database at `certifiedroadraces.com` is the register
of every certified road course in the United States. Checked 2026-09-23: a
search POST returns the full result table, and each row links a "course
certification packet" at `/certificate/generate-view.php?type=l&id=<certId>`.
That packet is **a two-page PDF of raster images** — 11 embedded images, no text
layer, no vector path, no coordinates. `usatf.org/robots.txt` disallows only
`/admin` and `/cmsdesk`; `certifiedroadraces.com` serves no robots.txt at all.

What the class is genuinely good for, and what we use it for:

- **Validating geometry we already hold.** The result table publishes, per
  certified course, the certified distance, the **net drop in m/km**, the
  start-finish separation in metres, the certification id and the expiry year.
  Those are surveyed numbers. California International's current certificate
  (`CA18004DT`) gives a drop of 2.21 m/km, which is 93 m of net descent over
  42.195 km. That is a real, authoritative number to check a course file
  against, and it is the cheapest quality signal available for any US race.
- **A trace input.** The packet's map is the published course map, from the most
  authoritative possible publisher. See class 4.
- **A still-runs signal.** A certification that has not expired is evidence the
  course is current.

AIMS and World Athletics publish measurement certificates internationally on the
same principle, with the same limitation.

### 3. Discovery rosters — admissible for discovery only, never geometry

A roster tells us a race exists. It never tells us where it goes.

- **findmymarathon.com** — the existing 766-row tracker. Discovery only, and the
  evidence for why is already in `scripts/import/README.md`: its elevation
  charts are rendered JPEGs and `/gpx/` is a soft-404 catch-all. Do not
  re-investigate it.
- **Wikipedia's per-continent "List of marathon races"** — read through the
  MediaWiki API (`action=parse&prop=wikitext`), which is the sanctioned access
  path, under CC BY-SA. Six pages, roughly 460 rows. Each row carries name,
  city, country, month, inception year and the organizer's own website link,
  **and encodes the World Athletics label tier as the row's background colour**
  (Platinum `#CCCCCC`, Gold `gold`, Elite `#9E8DC5`, Label `#A6FB65`), bold for
  a World Marathon Major and gray for defunct. That is the roster and the reach
  ranking in one parse.
- **AIMS (`aims-worldrunning.org`) — do not crawl.** Checked 2026-09-23: its
  `robots.txt` carries `Disallow: /events` and `Disallow: /members` under
  `User-agent: *`. Those are precisely the calendar and the member list. A
  person may of course read the site; **no script in this repo may fetch those
  paths**, and the plan that proposed crawling them was wrong.
- **World Athletics (`worldathletics.org`)** — `robots.txt` is `Allow: /`.
  Crawlable, though the Wikipedia tables already carry its label tiers, so in
  practice we do not need to.
- **goandrace.com** — unchanged from what `CLAUDE.md` already records: no
  `Disallow` in `robots.txt`, terms that restrict neither automated access nor
  commercial reuse, and a §5 that assigns responsibility for uploaded GPX to the
  submitting user. Nothing grants reuse either. That open question stands for
  the courses already shipped from it; this policy does not reopen them, and new
  goandrace imports remain subject to it.

### 4. Geometry we derive ourselves — admissible, and labelled as derived

Two kinds, and both are recorded rather than blended in.

- **Modelled elevation** (`dem:<dataset>`), already shipped. `elevate.ts` fills
  elevation from a terrain model when a route file carries none, and
  `decisions.json` records `source.elevation` so it is never confused with
  surveyed elevation. Calibrated 2026-08-17 across six courses: **≤6 s** of
  paceband drift on ordinary terrain, **17.4 s** on a bridge-heavy course,
  because a terrain model reads the water under a bridge and not the deck.
- **Traced route** (`traced:<method>`), new in #23. A route drawn from the
  race's published course map and snapped to the public road network. The
  resulting coordinates are our own work product derived from a factual
  description of a public route; the map image itself is never redistributed.
  Recorded as `source.geometry` in `decisions.json`, warned on in QA, and
  summarised at promote time, exactly as modelled elevation is.

  **Calibrated 2026-09-23**, the same way the DEM was: Berlin, whose surveyed
  line and surveyed elevation we already hold, was thinned to waypoints,
  re-traced through `trace.ts`, re-elevated from the DEM and put back through
  `parse_gpx.py`. Three courses compared at a 4:00 paceband, drift measured as
  the largest difference in any cumulative split:

  | geometry | elevation | gain | max split drift |
  |---|---|---|---|
  | surveyed | surveyed | 28.4 m | 0 s (the baseline) |
  | surveyed | `dem:srtm30m` | 62.8 m | **3.2 s** |
  | traced (48 waypoints) | `dem:srtm30m` | 69.0 m | **5.8 s** |

  **The line costs far less than the elevation does.** Modelling the elevation
  along Berlin's real course more than doubles its recorded gain on its own;
  re-drawing the line on top of that adds 6 m of gain and 2.6 s of drift. That
  is the argument for tracing: a traced course is almost always also a
  DEM course, because a race that published no route file published no
  elevation either, and the trace is the smaller of the two approximations it
  already carries. Berlin is flat, so treat these as the floor and expect more
  on a hilly course, exactly as the DEM's own 17.4 s bridge case warns.

  **Waypoint density has an optimum and it is not "more".** Same course, same
  everything else, varying only how many waypoints were placed:

  | waypoints | spacing | measured | error |
  |---|---|---|---|
  | 23 | 1.9 km | 41.57 km | 1.5% short, the router cuts corners |
  | 48 | 0.9 km | 42.43 km | **0.6% long, the usable setting** |
  | 94 | 0.45 km | 47.03 km | 11% long, the router zig-zags between them |

  Roughly one waypoint per kilometre. Packing them closer makes the result
  dramatically worse, because each one snaps to its own nearest way and the
  router detours between them. `trace.ts` rejects anything outside the parser's
  own [41.5, 43.6] km band rather than widening it, so this failure mode is
  caught rather than shipped.

A course whose elevation is modelled, or whose line is traced, **is a real
course, not a lesser one**. What makes it acceptable is that it is measured,
labelled and auditable, not that it is silently indistinguishable.

### 5. Route-sharing hosts — **not admissible**

Strava routes, plotaroute, RunGo and the like. Three problems, any one of which
would be enough:

1. **The geometry is some third party's upload.** The host did not measure the
   course and the uploader is usually not the organizer. Provenance is a guess.
2. **At least two of them signal no to automated access.** plotaroute sits
   behind Cloudflare with explicit content-signal reservations; RunGo's export
   requires a logged-in account. That is a no, and a workaround inside our
   pipeline would be a workaround around a no.
3. **We charge money for the output.** The organizer-site story survives that
   sentence. This one does not.

`adopt.ts` refuses `routeSource: "route-host"` unless `--allow-route-host` is
passed. The flag exists because a human may have a specific, defensible reason
(the host *is* the organizer, say), and because the alternative to an explicit
escape hatch is someone quietly relabelling the entry `"manual"`. Anyone using
it writes the reason into `routeNote`, and it lands in a committed file.

### 6. Reference data

`data/import/reach/cities.csv` is trimmed from GeoNames `cities15000`, which is
licensed **CC BY 4.0**. Attribution: city and population data from
[GeoNames](https://www.geonames.org/), CC BY 4.0. It is used offline to rank the
backlog by the size of the host city, and never rendered to a visitor.

## What is still not settled

The organizer-site class is the cleanest story available, and it is still not a
licence. No organizer has been asked, and none has said yes. What this policy
buys is that every course in the catalog can be traced to a named publisher, a
URL and a date, that nothing came from a source that told us not to take it, and
that derived geometry is labelled as derived.

If that is judged insufficient before a large batch ships, the next step is
outreach: ask organizers for permission, starting with the highest-reach races,
and record the answers in `adoptions.json` alongside the URL. That is a bigger
change to the workflow than this document makes, and it is the user's call, not
the pipeline's.

## See also

- `scripts/import/README.md` — the pipeline internals, and the findmymarathon
  evidence in full.
- `docs/UPLOADED-COURSES.md` — the same kind of written argument, for Rule 6.
- `ROADMAP.md` §23 — the project this policy was written for.
