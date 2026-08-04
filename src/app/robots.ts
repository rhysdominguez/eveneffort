import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Emitted at /robots.txt. Everything is crawlable except the routes that are
// either per-user or machine-only:
//   /api/*    — JSON endpoints, nothing to index
//   /results  — a pure function of its query string, so crawling it would
//               mint unbounded near-duplicate URLs (also noindex'd on the page)
//   /order/*  — post-checkout confirmation, already noindex'd
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/results", "/order/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
