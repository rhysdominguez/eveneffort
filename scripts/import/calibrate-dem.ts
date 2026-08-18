// Does a terrain model reproduce a surveyed course profile well enough to sell
// a paceband against?
//
//   node scripts/import/calibrate-dem.ts                    # full production path
//   node scripts/import/calibrate-dem.ts --quick            # 44 sample points only
//   node scripts/import/calibrate-dem.ts --only berlin,newyork --provider copernicus90m
//
// This is the gate on the whole DEM path, not a report. Every course already in
// src/data/courses/ has surveyed elevation from its own GPX, so re-deriving the
// same course from a DEM and diffing the result is a direct measurement of the
// error a DEM-sourced course would ship with.
//
// The default mode runs the real pipeline: take the committed GPX, throw its
// elevation away, refill it from the DEM, and push it through the unmodified
// parse_gpx.py. That matters because the parser applies a 200 m moving average
// before sampling, and averaging is exactly what a noisy point-sampled DEM
// needs. `--quick` skips the parser and compares 44 lone DEM samples instead —
// far cheaper, but it measures raw DEM noise rather than what we would ship.
//
// It reports the two things the product actually consumes:
//
//   elevation  — the 44 numbers in <slug>.json.
//   rise       — the 43 consecutive deltas. This is the one that matters. The
//                Minetti model reads gradient, so a profile offset by a constant
//                costs nothing while the same error spread unevenly moves every
//                split.
//
// Deliberately includes newyork: five bridges, and a DEM reads the water under
// them rather than the deck. If the approach survives that it will survive a
// road course.
//
// Not part of `npm run test` — it needs network, and CLAUDE.md Rule 9 says the
// suite must pass with nothing reachable.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PROVIDERS, OPENTOPODATA, lookupElevations } from "./dem.ts";
import { dedupe, parseRouteFile, toGpx } from "./route.ts";
import { COURSE_DIR, GPX_DIR, REPO_ROOT, flagValue } from "./shared.ts";

/**
 * A spread of profiles rather than a convenient one: dead flat, flat urban,
 * rolling, bridge-heavy, mountainous, extreme. A mean error over easy courses
 * would say nothing about the hard ones.
 */
const DEFAULT_SET = [
  "gold-coast-marathon", // dead flat, sea level
  "berlin", // flat urban
  "boston", // rolling, net downhill
  "newyork", // bridges — the adversarial case
  "blue-ridge-marathon", // mountainous
  "pikes-peak-marathon", // extreme, 2350 m gain
];

interface Row {
  slug: string;
  elevMae: number;
  elevMax: number;
  riseMae: number;
  riseMax: number;
  bias: number;
  gainSurveyed: number;
  gainDem: number;
}

const gain = (s: number[]) =>
  s.reduce((g, v, i) => (i === 0 ? 0 : g + Math.max(0, v - s[i - 1])), 0);

const deltas = (s: number[]) => s.slice(1).map((v, i) => v - s[i]);

function stats(a: number[], b: number[]): { mae: number; max: number } {
  let sum = 0;
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs(a[i] - b[i]);
    sum += d;
    if (d > max) max = d;
  }
  return { mae: sum / a.length, max };
}

function surveyed(slug: string): { elev: number[]; coords: [number, number][] } | null {
  const e = join(COURSE_DIR, `${slug}.json`);
  const c = join(COURSE_DIR, `${slug}.coords.json`);
  if (!existsSync(e) || !existsSync(c)) return null;
  return {
    elev: JSON.parse(readFileSync(e, "utf8")) as number[],
    coords: JSON.parse(readFileSync(c, "utf8")) as [number, number][],
  };
}

/** DEM-refill the real GPX and run the real parser. Returns its 44 elevations. */
async function viaParser(slug: string, providerId: string, work: string): Promise<number[]> {
  const route = dedupe(
    parseRouteFile(readFileSync(join(GPX_DIR, `${slug}.gpx`)), `${slug}.gpx`).points,
  );
  const provider = PROVIDERS[providerId];
  const elevations = await lookupElevations(
    route.map((p) => [p.lat, p.lon] as [number, number]),
    provider,
    (done, total) => process.stdout.write(`\r  ${slug} … DEM ${done}/${total}   `),
  );

  const inDir = join(work, "in");
  const outDir = join(work, "out");
  mkdirSync(inDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(inDir, `${slug}.gpx`),
    toGpx(
      route.map((p, i) => ({ ...p, ele: elevations[i] })),
      { name: slug, provenance: [`calibration copy — elevation from ${providerId}`] },
    ),
  );

  execFileSync(
    "python3",
    [
      join(REPO_ROOT, "scripts", "gpx_parser", "parse_gpx.py"),
      "--input-dir", inDir,
      "--out-dir", outDir,
      "--only", slug,
    ],
    { stdio: "pipe" },
  );

  return JSON.parse(readFileSync(join(outDir, `${slug}.json`), "utf8")) as number[];
}

async function main(argv: string[]): Promise<void> {
  const quick = argv.includes("--quick");
  const providerId = flagValue(argv, "--provider") ?? OPENTOPODATA.id;
  if (!PROVIDERS[providerId]) {
    throw new Error(`unknown provider "${providerId}" — try ${Object.keys(PROVIDERS).join(" or ")}`);
  }
  const only = flagValue(argv, "--only");
  const slugs = only ? only.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_SET;
  const work = mkdtempSync(join(tmpdir(), "dem-calib-"));

  console.log(
    `Calibrating ${providerId} against ${slugs.length} surveyed course(s) ` +
      `— ${quick ? "44 sample points" : "full route through parse_gpx.py"}.\n`,
  );

  const rows: Row[] = [];
  const profiles: Record<string, { surveyed: number[]; dem: number[] }> = {};
  for (const slug of slugs) {
    const truth = surveyed(slug);
    if (!truth) {
      console.log(`  ${slug}: no course files on disk — skipped`);
      continue;
    }

    let demElev: number[];
    if (quick) {
      process.stdout.write(`  ${slug} … `);
      demElev = await lookupElevations(truth.coords, PROVIDERS[providerId]);
    } else {
      demElev = await viaParser(slug, providerId, work);
      process.stdout.write(`\r  ${slug} … `.padEnd(34));
    }

    profiles[slug] = { surveyed: truth.elev, dem: demElev };
    const elev = stats(truth.elev, demElev);
    const rise = stats(deltas(truth.elev), deltas(demElev));
    rows.push({
      slug,
      elevMae: elev.mae,
      elevMax: elev.max,
      riseMae: rise.mae,
      riseMax: rise.max,
      bias: demElev.reduce((s, v, i) => s + (v - truth.elev[i]), 0) / demElev.length,
      gainSurveyed: gain(truth.elev),
      gainDem: gain(demElev),
    });
    console.log(
      `elev MAE ${elev.mae.toFixed(1)} m, rise MAE ${rise.mae.toFixed(1)} m, ` +
        `gain ${gain(truth.elev).toFixed(0)} -> ${gain(demElev).toFixed(0)} m`,
    );
  }

  if (rows.length === 0) throw new Error("no courses compared");

  const pad = (s: string, n: number) => s.padStart(n);
  console.log(
    `\n${"course".padEnd(26)}${pad("elevMAE", 9)}${pad("elevMax", 9)}${pad("riseMAE", 9)}` +
      `${pad("riseMax", 9)}${pad("bias", 8)}${pad("gain", 8)}${pad("demGain", 9)}`,
  );
  console.log("-".repeat(87));
  for (const r of rows) {
    console.log(
      r.slug.padEnd(26) +
        pad(r.elevMae.toFixed(1), 9) +
        pad(r.elevMax.toFixed(1), 9) +
        pad(r.riseMae.toFixed(1), 9) +
        pad(r.riseMax.toFixed(1), 9) +
        pad(r.bias.toFixed(1), 8) +
        pad(r.gainSurveyed.toFixed(0), 8) +
        pad(r.gainDem.toFixed(0), 9),
    );
  }

  // Dumping both profiles lets the paceband comparison (which needs the app's
  // module aliases, so it runs under vitest) reuse this run instead of paying
  // for the DEM lookups a second time.
  const out = flagValue(argv, "--out");
  if (out) {
    writeFileSync(out, `${JSON.stringify(profiles, null, 2)}\n`);
    console.log(`\nwrote ${out}`);
  }

  const meanRise = rows.reduce((s, r) => s + r.riseMae, 0) / rows.length;
  console.log(
    `\nrise MAE across set: ${meanRise.toFixed(2)} m per km-segment; ` +
      `worst single segment ${Math.max(...rows.map((r) => r.riseMax)).toFixed(1)} m.`,
  );
  console.log("Rise error is what moves a split. Judgement call, not a threshold enforced here.");
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
