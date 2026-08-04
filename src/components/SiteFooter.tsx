import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/orders";

// Shared site footer, rendered for every page via the root layout — the site
// previously had none, so /policies was reachable only from the print modal and
// the order-success page.
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
      { label: `Email ${SUPPORT_EMAIL}`, href: `mailto:${SUPPORT_EMAIL}` },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto w-full border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] print:hidden">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-wordmark text-[2rem] leading-none tracking-tight text-[var(--color-text-primary)]">
              eveneffort
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--color-text-secondary)]">
              Elevation- and weather-adjusted marathon pacing, so mile 25 costs
              you what mile 1 did.
            </p>
          </div>

          {LINK_COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                {column.heading}
              </p>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("mailto:") ? (
                      <a
                        href={link.href}
                        className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-[var(--color-border)] pt-8">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            © {new Date().getFullYear()} eveneffort. Pacing model after Minetti
            et al. (2002).
          </p>
        </div>
      </div>
    </footer>
  );
}
