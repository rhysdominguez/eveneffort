"use client";
import { useEffect, useRef } from "react";
import { ADS_ENABLED, ADSENSE_CLIENT, ADSENSE_SLOT } from "@/lib/ads";

// A single AdSense display unit. The loader script lives in layout.tsx; this
// only renders the slot and asks for a fill. The box keeps its height whether
// or not an ad arrives, so the modal never jumps.
export function AdSlot() {
  // One fill request per mounted <ins>, ever. The modal remounts this on every
  // open, and React strict mode runs effects twice in development — a second
  // push against an element AdSense has already claimed throws
  // "All ins elements in the DOM with class=adsbygoogle already have ads".
  const requested = useRef(false);

  useEffect(() => {
    if (!ADS_ENABLED || requested.current) return;
    requested.current = true;
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
      />
    </div>
  );
}
