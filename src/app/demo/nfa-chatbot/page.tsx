import type { Metadata } from "next";
import { DemoPasswordGate } from "@/components/DemoPasswordGate";

// Standalone demo page, deliberately outside the product's nav and design
// system: no chrome (see SiteChrome's CHROMELESS_ROUTES), not linked from
// anywhere, and not indexed. Password-gated (DemoPasswordGate) so the
// chatbot isn't visible to anyone just scrolling by the link.
export const metadata: Metadata = {
  title: "NFA Chatbot Demo",
  robots: { index: false, follow: false },
};

export default function NfaChatbotDemoPage() {
  return (
    <>
      {/* Fixed, viewport-pinned backdrop rather than relying on <main>'s own
          background reaching the bottom of the document: the Roomvo script
          appends its own DOM to the page and can make it taller than one
          screen, which would otherwise expose the page's default white
          background below the fold. A fixed layer stays glued to the
          viewport at every scroll position, so there is never a seam to
          scroll into. */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-[var(--color-bg-footer-deep)]"
      />
      <DemoPasswordGate>
        {/* Mount point for the Roomvo chatbot launcher; the launcher script
            finds it by id and renders into it, so it stays empty here. */}
        <div id="roomvoChatbotLauncherContainer" />
        <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-bg-footer-deep)]">
          <h1 className="text-3xl font-light uppercase tracking-[0.35em] text-[var(--color-text-on-dark)] sm:text-4xl">
            NFA Chatbot Demo
          </h1>
        </main>
      </DemoPasswordGate>
    </>
  );
}
