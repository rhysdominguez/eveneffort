import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Emitted at /sitemap.xml. Only the three indexable pages belong here —
// /results is query-string driven and /order/success is post-checkout, both
// noindex (see robots.ts).
//
// lastModified is the build date rather than a hardcoded one: these are
// hand-edited content pages, and a deploy is the only thing that changes them.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/methodology`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/policies`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
