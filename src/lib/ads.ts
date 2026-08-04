// Google AdSense identifiers. Swap the placeholders for the real publisher /
// ad-unit IDs (or set the env vars in Vercel) — until then the script loads
// but no ad fills. AdSense also never serves on localhost.
export const ADSENSE_CLIENT =
  process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "ca-pub-XXXXXXXXXXXXXXXX";

export const ADSENSE_SLOT =
  process.env.NEXT_PUBLIC_ADSENSE_SLOT ?? "XXXXXXXXXX";
