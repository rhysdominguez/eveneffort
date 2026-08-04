// The AdSense loader script defines this queue; pushing an object asks it to
// fill the most recently rendered <ins class="adsbygoogle"> element.
declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

export {};
