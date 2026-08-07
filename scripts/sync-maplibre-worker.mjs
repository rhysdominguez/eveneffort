// Copy MapLibre's web worker into public/ so the browser can actually fetch it.
//
// MapLibre parses vector tiles off the main thread. It finds that worker by
// resolving "./maplibre-gl-worker.mjs" against its own `import.meta.url` —
// which, once the library has been bundled into a Next chunk, points at
// /_next/static/chunks/, where the worker file does not exist. Next answers
// with a 404, the module worker is rejected, and the map fails in the most
// confusing way available: canvas, zoom buttons and attribution all render,
// tiles silently never load, and no error reaches the console.
//
// `setWorkerUrl()` in CourseMap.tsx points at the copy this script makes.
// Bundler `new URL(..., import.meta.url)` tricks don't survive a bare
// node_modules specifier under Turbopack, and this is the version-safe
// alternative: the files are copied from the installed package at build time,
// so they cannot drift from the maplibre-gl the app is bundling.
//
// Both files are needed — the worker imports the shared chunk by relative
// path, so they have to land in the same directory. Run from `predev` and
// `prebuild`; `public/maplibre/` is generated and gitignored.
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const out = join(process.cwd(), "public", "maplibre");

await mkdir(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(join(dist, file), join(out, file));
}
console.log(`maplibre worker synced to public/maplibre/ from ${dist}`);
