// Generate src/data/courses/<slug>.outline.json from data/gpx_sources/<slug>.gpx.
//
//   node scripts/build-outlines.ts              # every course missing one
//   node scripts/build-outlines.ts --force      # rewrite all of them
//   node scripts/build-outlines.ts --only berlin,tokyo
//
// THE FOURTH GEOMETRY FILE, alongside <slug>.json (44 elevations),
// <slug>.coords.json (44 [lat, lon]) and <slug>.profile.json (dense
// [km, elevation]). Same contract as the other three: version-controlled,
// committed, and the source of truth scripts/seed.ts loads. See ROADMAP #21.
//
// THE OTHER THREE ARE WRITTEN BY scripts/gpx_parser/parse_gpx.py AND THIS ONE
// IS NOT, which is a deliberate departure worth explaining. Rule 7 keeps Python
// to the parser because app code is TypeScript. The 44-point resampler had to
// be mirrored into TypeScript anyway, because the upload route cannot shell out
// to Python on Vercel, and that mirror costs a conformance test asserting the
// two produce byte-identical output. The outline needs the same thing at
// runtime for uploads, so writing it in Python would buy a second copy and a
// second conformance test for nothing. parseRouteFile already reads GPX in
// TypeScript, so both callers run src/lib/course/outline.ts unchanged.
//
// Adding a course therefore gains a step: run this after import:parse. The
// import pipeline calls it for you; a hand-added course does not, which is why
// courses.outline.integrity.test.ts fails on a course whose outline is missing.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseRouteFile } from "../src/lib/course/routeFile.ts";
import { simplifyOutline } from "../src/lib/course/outline.ts";

const ROOT = process.cwd();
const GPX_DIR = join(ROOT, "data", "gpx_sources");
const COURSE_DIR = join(ROOT, "src", "data", "courses");

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

const force = process.argv.includes("--force");
const only = arg("only")
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const slugs = (
  only ??
  readdirSync(GPX_DIR)
    .filter((f) => f.endsWith(".gpx"))
    .map((f) => f.slice(0, -".gpx".length))
).sort();

let written = 0;
let skipped = 0;
const problems: string[] = [];

for (const slug of slugs) {
  const gpx = join(GPX_DIR, `${slug}.gpx`);
  const out = join(COURSE_DIR, `${slug}.outline.json`);

  if (!existsSync(gpx)) {
    problems.push(`${slug}: no GPX at ${gpx}`);
    continue;
  }
  if (!force && existsSync(out)) {
    skipped++;
    continue;
  }

  try {
    const route = parseRouteFile(readFileSync(gpx), `${slug}.gpx`);
    const outline = simplifyOutline(route.points);
    if (!outline) {
      problems.push(`${slug}: too few usable trackpoints for an outline`);
      continue;
    }
    // One line, no pretty-printing: these are data files, not documents, and
    // an indented 550-point array is a 30 KB diff for a 9 KB fact.
    const json = JSON.stringify(outline);
    const unchanged = existsSync(out) && readFileSync(out, "utf8") === json;
    if (unchanged) {
      skipped++;
      continue;
    }
    writeFileSync(out, json);
    written++;
  } catch (err) {
    problems.push(`${slug}: ${(err as Error).message}`);
  }
}

console.log(
  `outlines: ${written} written, ${skipped} unchanged, ${problems.length} problems`,
);
for (const p of problems) console.log(`  ${p}`);
process.exit(problems.length > 0 ? 1 : 0);
