"use client";
import { usePathname } from "next/navigation";
import { SiteNav } from "./SiteNav";
import { SiteFooter } from "./SiteFooter";

// Routes that render with no site chrome at all — no nav, no footer, not the
// sticky/compress behavior SiteNav does on scroll. Exact path or anything
// nested under it. Kept as a short explicit list rather than a page-level
// prop so a chromeless page can stay a plain server component; the one
// client boundary lives here instead of spreading "use client" around.
const CHROMELESS_ROUTES = ["/demo/nfa-chatbot"];

function isChromeless(pathname: string) {
  return CHROMELESS_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isChromeless(pathname)) return <>{children}</>;
  return (
    <>
      <SiteNav />
      {children}
      <SiteFooter />
    </>
  );
}
