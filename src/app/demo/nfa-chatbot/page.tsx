import type { Metadata } from "next";

// Standalone demo page, deliberately outside the product's nav and design
// system: no chrome (see SiteChrome's CHROMELESS_ROUTES), not linked from
// anywhere, and not indexed. Just a title card on a black field.
export const metadata: Metadata = {
  title: "NFA Chatbot Demo",
  robots: { index: false, follow: false },
};

export default function NfaChatbotDemoPage() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-bg-footer-deep)]">
      <h1 className="text-3xl font-light uppercase tracking-[0.35em] text-[var(--color-text-on-dark)] sm:text-4xl">
        NFA Chatbot Demo
      </h1>
    </main>
  );
}
