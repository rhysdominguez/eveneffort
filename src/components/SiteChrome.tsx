"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SiteNav } from "./SiteNav";
import { SiteFooter } from "./SiteFooter";

// Routes that render with no site chrome at all — no nav, no footer, not the
// sticky/compress behavior SiteNav does on scroll. Exact path or anything
// nested under it. Kept as a short explicit list rather than a page-level
// prop so a chromeless page can stay a plain server component; the one
// client boundary lives here instead of spreading "use client" around.
const CHROMELESS_ROUTES = ["/demo/nfa-chatbot"];

// Chromeless pages paint their own dark background on <main>, but a
// fixed-position third-party widget (the Roomvo launcher bar) can reserve
// space by padding <body> itself — that padding shows whatever <body>'s own
// background is, which globals.css never sets (only <html> does, to white).
// The result is a thin white seam between the widget and the dark page.
// Painting <html>/<body> to match removes the seam regardless of how much
// space the widget reserves, without the page needing to know about it.
const DARK_SURFACE = "var(--color-bg-footer-deep)";

function isChromeless(pathname: string) {
  return CHROMELESS_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const chromeless = isChromeless(pathname);

  useEffect(() => {
    if (!chromeless) return;
    const html = document.documentElement.style;
    const body = document.body.style;
    const prevHtml = html.backgroundColor;
    const prevBody = body.backgroundColor;
    html.backgroundColor = DARK_SURFACE;
    body.backgroundColor = DARK_SURFACE;
    return () => {
      html.backgroundColor = prevHtml;
      body.backgroundColor = prevBody;
    };
  }, [chromeless]);

  if (chromeless) return <>{children}</>;
  return (
    <>
      <SiteNav />
      {children}
      <SiteFooter />
    </>
  );
}
