import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { OrderModal } from "./OrderModal";
import { startCheckout } from "@/lib/checkout";

// The real helper navigates the browser, which jsdom cannot do — mocking the
// module (rather than window.location) keeps the redirect out of the test.
vi.mock("@/lib/checkout", () => ({ startCheckout: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const mockedCheckout = vi.mocked(startCheckout);

const QUERY = "courseId=boston&unit=km&goalTimeSeconds=10800";

const renderModal = (open = true) => {
  const onClose = vi.fn();
  const utils = render(
    <OrderModal
      open={open}
      panelRef={createRef<HTMLDivElement>()}
      resultsQuery={QUERY}
      onClose={onClose}
    />,
  );
  return { ...utils, onClose };
};

describe("OrderModal", () => {
  beforeEach(() => {
    mockedCheckout.mockReset();
    mockedCheckout.mockResolvedValue(undefined);
  });

  it("renders nothing while closed", () => {
    const { queryByRole } = renderModal(false);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("shows the printed band offer", () => {
    const { container } = renderModal();
    const text = container.textContent ?? "";
    expect(text).toContain("Order the printed band");
    expect(text).toContain("$9.99");
    expect(text).toContain("Free shipping, US only.");
  });

  it("closes from the ✕ button", () => {
    const { getByLabelText, onClose } = renderModal();
    fireEvent.click(getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("starts checkout with the results query and stays disabled through the redirect", async () => {
    const { getByRole } = renderModal();
    const order = getByRole("button", { name: "Order for $9.99" });
    fireEvent.click(order);
    expect(mockedCheckout).toHaveBeenCalledWith(QUERY);
    await waitFor(() => {
      expect(
        getByRole("button", { name: "Starting checkout…" }).hasAttribute(
          "disabled",
        ),
      ).toBe(true);
    });
  });

  it("surfaces a checkout failure and lets the runner retry", async () => {
    mockedCheckout.mockRejectedValue(new Error("Ordering is not set up yet."));
    const { getByRole, findByRole } = renderModal();
    fireEvent.click(getByRole("button", { name: "Order for $9.99" }));

    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("Ordering is not set up yet.");
    expect(
      getByRole("button", { name: "Order for $9.99" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});
