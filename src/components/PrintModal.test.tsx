import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { PrintModal } from "./PrintModal";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const renderModal = (open = true) => {
  const onClose = vi.fn();
  const onPrint = vi.fn();
  const utils = render(
    <PrintModal
      open={open}
      panelRef={createRef<HTMLDivElement>()}
      onClose={onClose}
      onPrint={onPrint}
    />,
  );
  return { ...utils, onClose, onPrint };
};

describe("PrintModal", () => {
  it("renders nothing while closed", () => {
    const { queryByRole } = renderModal(false);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("shows the advertisement label and ad slot when open", () => {
    const { getByRole, container } = renderModal();
    expect(getByRole("dialog")).not.toBeNull();
    expect(container.textContent).toContain("Advertisement");
    expect(container.querySelector("ins.adsbygoogle")).not.toBeNull();
  });

  it("closes from the ✕ button and prints from the Print button", () => {
    const { getByLabelText, getByRole, onClose, onPrint } = renderModal();
    fireEvent.click(getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole("button", { name: "Print" }));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });
});
