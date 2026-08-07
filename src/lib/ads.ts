// Google AdSense identifiers.
//
// The publisher ID is not a secret — it ships in the client bundle on every
// page and is published verbatim in /ads.txt — so it lives here as a literal
// rather than an env var that could silently go missing on a deploy and take
// site verification down with it. NEXT_PUBLIC_ADSENSE_CLIENT can still
// override it (useful if the account is ever migrated).
export const ADSENSE_CLIENT =
  process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "ca-pub-6714174677214181";

// The ad unit. Unlike the publisher ID this has no sensible default: the unit
// does not exist until AdSense approves the site and you create it, so the
// placeholder means "not configured yet".
const SLOT_PLACEHOLDER = "XXXXXXXXXX";

export const ADSENSE_SLOT =
  process.env.NEXT_PUBLIC_ADSENSE_SLOT ?? SLOT_PLACEHOLDER;

// Whether to actually request a fill. Requesting against the placeholder slot
// only produces console errors, so the slot renders as an empty reserved box
// until a real unit ID is configured. The loader script still loads regardless
// — Google needs to see it on the live site to verify ownership and review.
export const ADS_ENABLED = ADSENSE_SLOT !== SLOT_PLACEHOLDER;
