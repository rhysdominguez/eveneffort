import type { Metadata } from "next";
import { Montserrat, Fraunces } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ADSENSE_CLIENT } from "@/lib/ads";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

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
    default: "eveneffort — Elevation-adjusted marathon pacing",
    template: "%s — eveneffort",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: "/",
    title: "eveneffort — Elevation-adjusted marathon pacing",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    // No twitter-image file: X falls back to og:image, and one generated card
    // is easier to keep honest than two.
    card: "summary_large_image",
    title: "eveneffort — Elevation-adjusted marathon pacing",
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteNav />
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
