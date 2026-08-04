import { ImageResponse } from "next/og";

// The social card for every page that doesn't override it. Generated at build
// time (no request-time APIs, no fetches) and served as a static PNG.
export const alt =
  "eveneffort — elevation-adjusted marathon pacing charts, over a course elevation profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// DESIGN NOTE — the one sanctioned exception to the "tokens only" rule in
// CLAUDE.md. This image is rendered by satori (next/og), not by a browser:
// there is no CSS cascade and no custom-property resolution, so `var(--…)`
// would render as an invalid color. These literals MIRROR globals.css @theme
// and must be updated alongside it if the palette ever moves.
const T = {
  bgPage: "#FFFFFF", // --color-bg-page
  textPrimary: "#0A0A0A", // --color-text-primary
  textSecondary: "#525252", // --color-text-secondary
  textTertiary: "#A3A3A3", // --color-text-tertiary
  redPrimary: "#B91C1C", // --color-red-primary
  border: "#E5E5E5", // --color-border
} as const;

// A stylized course profile — the product's whole thesis in one shape. Drawn
// rather than sampled from a real course so it stays legible at card size and
// doesn't imply we're advertising one specific marathon.
// Coordinates are already in the final 1200×124 space — no preserveAspectRatio
// scaling, which would stretch the stroke unevenly.
const PROFILE_HEIGHT = 124;
const PROFILE =
  "M0 104 L80 93 L160 98 L240 74 L320 82 L400 46 L480 60 L560 37 L640 55 L720 25 L800 48 L880 32 L960 64 L1040 52 L1120 79 L1200 68";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: T.bgPage,
          // Extra bottom padding reserves the strip the profile occupies, so
          // the line never crosses the footer text.
          padding: "72px 80px 128px",
          position: "relative",
        }}
      >
        {/* Profile bleeds to both edges behind the content. Absolutely
            positioned, so it's out of flex flow — but it must come FIRST in
            the DOM or it paints over the footer text. */}
        <svg
          width={1200}
          height={PROFILE_HEIGHT}
          viewBox={`0 0 1200 ${PROFILE_HEIGHT}`}
          style={{ position: "absolute", bottom: 0, left: 0 }}
        >
          <path
            d={`${PROFILE} L1200 ${PROFILE_HEIGHT} L0 ${PROFILE_HEIGHT} Z`}
            fill={T.redPrimary}
            fillOpacity={0.06}
          />
          <path
            d={PROFILE}
            fill="none"
            stroke={T.redPrimary}
            strokeWidth={4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        {/* Wordmark. Fraunces isn't available to satori without shipping the
            font binary, so the mark leans on weight and tracking instead. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 30,
            fontWeight: 600,
            color: T.textPrimary,
            letterSpacing: "-0.02em",
          }}
        >
          eveneffort
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: T.redPrimary,
              marginLeft: 10,
              marginTop: 12,
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 500,
              color: T.redPrimary,
              letterSpacing: "-0.01em",
            }}
          >
            Even effort, not even splits.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 700,
              color: T.textPrimary,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            Marathon pacing shaped by the hills you&apos;ll actually run.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: T.textSecondary,
              lineHeight: 1.4,
            }}
          >
            Elevation- and weather-adjusted splits from the Minetti (2002)
            energy cost model.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${T.border}`,
            paddingTop: 28,
            fontSize: 24,
            color: T.textTertiary,
          }}
        >
          <div style={{ display: "flex" }}>eveneffort.com</div>
          <div style={{ display: "flex" }}>Free · No account needed</div>
        </div>
      </div>
    ),
    size,
  );
}
