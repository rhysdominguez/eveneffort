import type { Metadata } from "next";
import { Montserrat, Fraunces } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ADSENSE_CLIENT } from "@/lib/ads";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { getCourseCatalog } from "@/db/queries";
import { themeInitScript } from "@/lib/theme";

// Montserrat drives the whole site (body + headings).
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

// Fraunces is retained solely for the original "eveneffort" wordmark.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fraunces",
  display: "swap",
});

// metadataBase makes every relative URL below (and the generated OG image)
// resolve to an absolute one — without it Next can't build og:image tags and
// falls back to guessing the origin from the deployment.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    // Pages set a bare title ("Our methodology") and get the suffix for free;
    // `default` is what the home page and anything untitled uses.
    default: "eveneffort: Elevation-adjusted marathon pacing",
    template: "%s | eveneffort",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: "/",
    title: "eveneffort: Elevation-adjusted marathon pacing",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    // No twitter-image file: X falls back to og:image, and one generated card
    // is easier to keep honest than two.
    card: "summary_large_image",
    title: "eveneffort: Elevation-adjusted marathon pacing",
    description: SITE_DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Light, cached read (see src/db/queries.ts) — this is the same catalog the
  // home page fetches, reused here so the nav's "Pacing Calculator" link
  // always has a default course to send you to, even with nothing set up yet.
  const catalog = await getCourseCatalog();

  return (
    // suppressHydrationWarning is for the theme script below and nothing else:
    // it adds `data-theme` to this element before React hydrates, so the
    // attribute the server rendered differs from the one the client finds. The
    // flag applies to this element's own attributes only, not to its children.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${montserrat.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        {/* Blocking on purpose: it has to run before first paint, or a reader
            who chose dark sees a white frame on every load. See themeInitScript. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteNav catalog={catalog} />
        {children}
        <SiteFooter />
        {/* Page views only — the paceband funnel's in-app steps go through
            /api/event (see lib/analytics.ts) and payment through Stripe. */}
        <Analytics />
        <Script
          id="adsbygoogle-init"
          async
          strategy="afterInteractive"
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
        />
      </body>
    </html>
  );
}
