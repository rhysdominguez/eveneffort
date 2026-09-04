// Moved to src/lib/course/routeFile.ts, where the upload route can reach it
// (ROADMAP #10). Re-exported here so every import script in this directory —
// adopt.ts, elevate.ts, calibrate-dem.ts — keeps its `./route.ts` specifier.
export * from "../../src/lib/course/routeFile.ts";
