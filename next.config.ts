import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The hero is a full-bleed `sizes="100vw"` photo, so the srcset candidate
    // a browser picks is viewport width x DPR. Next's default list tops out at
    // 3840, which every retina laptop selects (1512 CSS px x 2 = 3024 -> 3840).
    // Generating that variant from a large source overruns the optimizer's
    // per-request budget, and on failure it falls back to serving the
    // *unoptimized* original — 8.6 MB on the wire for the hero. Capping the
    // list at 1920 keeps the biggest variant one the optimizer can always
    // produce. On a >1920px display the photo upscales slightly, which is
    // invisible behind `.hero-scrim` and worth an order of magnitude of bytes.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],

    // Next 16 defaults this to [75] and coerces anything else to the nearest
    // allowed value, so 60 has to be declared to be usable. The hero requests
    // it: a motion-blurred photo under a gradient veil shows no artifacts at
    // 60, and it is ~150 KB cheaper than 75 at 1920w.
    qualities: [60, 75],

    // Files in public/ carry no Cache-Control of their own, and the optimizer
    // takes the larger of that header and this value. Left at the default the
    // hero revalidated on essentially every visit.
    minimumCacheTTL: 2678400, // 31 days
  },
};

export default nextConfig;
