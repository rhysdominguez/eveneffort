import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/orders";

// Shared site footer, rendered for every page via the root layout — the site
// previously had none, so /policies was reachable only from the print modal and
// the order-success page.
//
// Two dark tiers following the Macmillan reference's structure: wordmark and
// rule-separated link columns on top, a step-darker centred band closing it.
// This is the site's ONLY dark surface and the only place the `*-on-dark`
// tokens may be used — see DESIGN.md § Theme; it is a band, not a dark mode.
//
// No newsletter signup, unlike the Macmillan reference: there is no backend to
// take an address, and a form that silently discards input is worse than none.
// print:hidden for the same reason as SiteNav — the paceband is the only thing
// that should reach paper.
const LINK_COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Pacing calculator", href: "/" },
      { label: "Our methodology", href: "/methodology" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Shipping & refunds", href: "/policies" },
      { label: "Contact", href: `mailto:${SUPPORT_EMAIL}` },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms and conditions", href: "/terms" },
    ],
  },
] as const;

const linkClass =
  "text-sm text-[var(--color-text-on-dark-muted)] transition-colors hover:text-[var(--color-text-on-dark)]";

export function SiteFooter() {
  return (
    <footer className="mt-auto w-full bg-[var(--color-bg-footer)] print:hidden">
      {/* Upper tier: wordmark block beside the link columns. No border-t — the
          dark fill is its own separation from the white page above it. */}
      <div className="mx-auto max-w-7xl px-6 py-16">
        {/* 5 tracks: the wordmark block takes 2, then one per link column. */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="font-wordmark text-[2rem] leading-none tracking-tight text-[var(--color-text-on-dark)]">
              eveneffort
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--color-text-on-dark-muted)]">
              Elevation- and weather-adjusted marathon pacing, so mile 25 costs
              you what mile 1 did.
            </p>
          </div>

          {/* Vertical rule opens each column, and the last one closes the set
              on the right — the reference's four rules around three columns.
              Suppressed below lg, where the columns stack and a left-hand rule
              would read as a stray mark rather than a divider. */}
          {LINK_COLUMNS.map((column, index) => (
            <div
              key={column.heading}
              className={`lg:pl-10 lg:border-l lg:border-[var(--color-border-on-dark)] ${
                index === LINK_COLUMNS.length - 1
                  ? "lg:border-r lg:pr-10"
                  : ""
              }`}
            >
              <p className="text-sm font-semibold text-[var(--color-text-on-dark)]">
                {column.heading}
              </p>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("mailto:") ? (
                      <a href={link.href} className={linkClass}>
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Lower tier: a darker band closing the page, centred. Separated from
          the tier above by the step down in fill alone — no rule, per the
          reference. No social icons: eveneffort has no accounts to link, and
          icons pointing nowhere would be worse than their absence. */}
      <div className="w-full bg-[var(--color-bg-footer-deep)]">
        <div className="mx-auto max-w-7xl px-6 py-8 text-center">
          <p className="text-xs text-[var(--color-text-on-dark-muted)]">
            © {new Date().getFullYear()} eveneffort. Pacing model after Minetti
            et al. (2002).
          </p>
        </div>
      </div>
    </footer>
  );
}
