import Link from "next/link";

// Shared top nav, rendered for every page via the root layout. Links are
// intentionally inert (href="#") — slots for future routes, not built yet.
const NAV_LINKS = ["Our Methodology", "FAQs"] as const;

export function SiteNav() {
  return (
    <nav className="border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="font-wordmark text-[2rem] leading-none tracking-tight text-[var(--color-text-primary)]"
        >
          eveneffort
        </Link>
        <ul className="flex items-center gap-10">
          {NAV_LINKS.map((label) => (
            <li key={label}>
              <a
                href="#"
                className="text-lg font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
