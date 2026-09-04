// CLI wrapper for the DEM elevation stage. The policy and the transport moved
// to src/lib/course/ when the upload route needed them at runtime (ROADMAP #10);
// only the command-line half is still build-time tooling, so only it lives here.
//
//   node scripts/import/elevate.ts data/gpx_sources/foo.gpx --out /tmp/foo.gpx
//
// Re-exported so `import { ensureElevation } from "./elevate.ts"` keeps working
// for adopt.ts and anything else in this directory.

import { readFileSync, writeFileSync } from "node:fs";

import { OPENTOPODATA, PROVIDERS } from "./dem.ts";
import { dedupe, parseRouteFile, toGpx } from "./route.ts";
import { flagValue } from "./shared.ts";
import { ensureElevation } from "../../src/lib/course/elevate.ts";

export * from "../../src/lib/course/elevate.ts";

async function main(argv: string[]): Promise<void> {
  const input = argv.find((a) => !a.startsWith("--"));
  if (!input) throw new Error("usage: elevate.ts <route file> [--out <gpx>] [--force]");

  const providerId = flagValue(argv, "--provider") ?? OPENTOPODATA.id;
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`unknown provider "${providerId}"`);

  const route = parseRouteFile(readFileSync(input), input);
  const points = dedupe(route.points);
  console.log(`${input}: ${points.length} points, format ${route.format}`);

  const outcome = await ensureElevation(points, {
    provider,
    force: argv.includes("--force"),
    onProgress: (d, t) => process.stdout.write(`\r  DEM ${d}/${t}   `),
  });
  console.log(`\nelevation source: ${outcome.source}`);
  for (const w of outcome.warnings) console.log(`  warning: ${w}`);

  const out = flagValue(argv, "--out");
  if (out) {
    writeFileSync(
      out,
      toGpx(outcome.points, {
        name: route.name ?? "course",
        provenance: [`elevation: ${outcome.source}`],
      }),
    );
    console.log(`wrote ${out}`);
  }
}

if (process.argv[1]?.endsWith("elevate.ts")) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
