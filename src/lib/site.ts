// Canonical site identity. One source of truth for the absolute origin, used
// by metadataBase, the sitemap and robots.txt so they can never disagree.
//
// NEXT_PUBLIC_SITE_URL is a build-time inline (see .env.example) — Vercel
// Production sets it to https://eveneffort.com. The literal fallback keeps
// local dev and previews emitting absolute, valid URLs rather than the
// localhost origin, which is what we want: preview OG cards should point at
// production assets, not at a host no crawler can reach.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://eveneffort.com"
).replace(/\/$/, "");

export const SITE_NAME = "eveneffort";

// The one-line description that goes everywhere: <meta name="description">,
// the OG card, the Twitter card. Kept under ~155 chars so Google doesn't
// truncate it in the SERP.
export const SITE_DESCRIPTION =
  "Free elevation- and weather-adjusted marathon pacing charts. Even effort, not even splits — built on the Minetti (2002) energy cost model.";
