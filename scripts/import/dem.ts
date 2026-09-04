// Moved to src/lib/course/dem.ts, where the upload route can reach it
// (ROADMAP #10). Re-exported here so adopt.ts and calibrate-dem.ts keep their
// `./dem.ts` specifier.
export * from "../../src/lib/course/dem.ts";
