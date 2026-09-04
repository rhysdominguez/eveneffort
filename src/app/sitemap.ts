import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Emitted at /sitemap.xml. Only the indexable pages belong here —
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
      url: `${SITE_URL}/courses`,
      lastModified,
      // The one page here whose content changes without a hand edit: seeding
      // new races changes the ranking.
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      // Only the bare URL. Every ?from=…&to=… permutation canonicalizes back
      // here (see the route's metadata), so the params stay out of the index.
      url: `${SITE_URL}/compare`,
      lastModified,
      // Same reason as /courses: seeding new races changes what this page says
      // without anyone editing it.
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/boston-qualifier`,
      lastModified,
      // The standards move about once a year, and the indexed-course table
      // below them changes whenever a downhill race is seeded.
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      // Static copy plus a form. Nothing here changes with the catalog: an
      // uploaded course is unlisted and never indexed.
      url: `${SITE_URL}/upload`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.7,
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
