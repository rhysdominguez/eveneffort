import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SiteFooter } from "./SiteFooter";
import { SUPPORT_EMAIL } from "@/lib/orders";

describe("SiteFooter", () => {
  it("links to the content pages that previously had no nav route in", () => {
    const { container } = render(<SiteFooter />);
    expect(container.querySelector('a[href="/methodology"]')).not.toBeNull();
    expect(container.querySelector('a[href="/policies"]')).not.toBeNull();
    expect(
      container.querySelector(`a[href="mailto:${SUPPORT_EMAIL}"]`),
    ).not.toBeNull();
  });

  it("carries the legal pages, which have no other route in", () => {
    const { container } = render(<SiteFooter />);
    expect(container.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(container.querySelector('a[href="/terms"]')).not.toBeNull();
  });

  it("stays off the printed page", () => {
    const { container } = render(<SiteFooter />);
    expect(container.querySelector("footer")?.className).toContain(
      "print:hidden",
    );
  });
});
