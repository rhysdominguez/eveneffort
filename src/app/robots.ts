import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Emitted at /robots.txt. Everything is crawlable except the routes that are
// either per-user or machine-only:
//   /api/*    — JSON endpoints, nothing to index
//   /results  — a pure function of its query string, so crawling it would
//               mint unbounded near-duplicate URLs (also noindex'd on the page)
//   /order/*  — post-checkout confirmation, already noindex'd
//
// Mediapartners-Google is carved out of that. It is AdSense's contextual
// crawler, not an indexing crawler — it reads the page an ad is about to
// render on so the ad can be relevant, and it obeys robots.txt under its own
// user-agent independently of Googlebot. Our only ad unit lives in the print
// modal on /results, so leaving it under the blanket disallow would mean
// AdSense could never read the page it serves on: untargeted or blank fills,
// and a possible "ad serving disabled" flag on the account. Allowing it does
// not make /results indexable — the page carries its own noindex.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/results", "/order/"],
      },
      {
        userAgent: "Mediapartners-Google",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
