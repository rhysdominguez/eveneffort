// Normalizes brand logos for the homepage "Compatible With" strip.
//
// Problem: each source logo (SVG/PNG/JPG) has different baked-in
// whitespace and aspect ratio, so a CSS height cap can't make them
// look the same size or stay aligned.
//
// Fix: trim the surrounding background off each source and re-render it
// to an identical content height. The page then displays them at one
// uniform CSS height, so they appear equal-sized and vertically
// aligned with zero per-logo tuning.
//
// Run from repo root:  node scripts/normalize_logos.mjs
// Output: public/logos/<name>.norm.png  (referenced by src/app/page.tsx)

import sharp from "sharp";

const DIR = "public/logos";
const HEIGHT = 64; // content px; displayed at 32px (h-8), 2x for retina

const SOURCES = {
  strava: "strava.svg",
  garmin: "garmin.svg",
  coros: "coros.png",
  "apple-watch": "apple-watch.jpg",
  suunto: "suunto.svg",
};

for (const [name, file] of Object.entries(SOURCES)) {
  const path = `${DIR}/${file}`;
  const isSvg = file.endsWith(".svg");
  let img = sharp(path, isSvg ? { density: 600 } : {});
  // JPEGs have a solid white bg — flatten so trim() can strip it.
  if (file.endsWith(".jpg")) img = img.flatten({ background: "#ffffff" });

  let buf = await img.png().toBuffer();
  buf = await sharp(buf).trim({ threshold: 10 }).toBuffer(); // drop whitespace

  const out = `${DIR}/${name}.norm.png`;
  await sharp(buf).resize({ height: HEIGHT }).png().toFile(out);

  const m = await sharp(out).metadata();
  console.log(`${name}: ${m.width}x${m.height}`);
}
