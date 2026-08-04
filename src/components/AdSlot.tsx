"use client";
import { useEffect } from "react";
import { ADSENSE_CLIENT, ADSENSE_SLOT } from "@/lib/ads";

// A single AdSense display unit. The loader script lives in layout.tsx; this
// only renders the slot and asks for a fill. The box keeps its height whether
// or not an ad arrives, so the modal never jumps.
export function AdSlot() {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // Ad blockers make the loader throw; the empty slot is the fallback.
    }
  }, []);

  return (
    <div className="flex min-h-[250px] items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "100%" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_SLOT}
        data-ad-format="rectangle"
        data-full-width-responsive="true"
      />
    </div>
  );
}
