import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { HeightField } from "./HeightField";

describe("HeightField — stepper", () => {
  it("steps the cm field like any other NumericField", () => {
    const seen: (number | null)[] = [];
    const { getByLabelText } = render(
      <HeightField value={175} onChange={(n) => seen.push(n)} unit="cm" onUnitChange={() => {}} />,
    );
    fireEvent.click(getByLabelText("Increase Height"));
    expect(seen).toEqual([176]);
  });

  it("steps feet and inches independently in imperial mode", () => {
    const seen: (number | null)[] = [];
    // 175cm ≈ 5'9" — the ft/in pair the field derives it into.
    const { getByLabelText } = render(
      <HeightField value={175} onChange={(n) => seen.push(n)} unit="ftin" onUnitChange={() => {}} />,
    );
    fireEvent.click(getByLabelText("Increase ft"));
    fireEvent.click(getByLabelText("Increase in"));
    expect(seen).toHaveLength(2);
    // Both should move the canonical cm value further from the start.
    expect(seen[0]).toBeGreaterThan(175);
    expect(seen[1]).toBeGreaterThan(175);
  });

  it("never steps a part below zero", () => {
    const seen: (number | null)[] = [];
    const { getByLabelText } = render(
      <HeightField value={0} onChange={(n) => seen.push(n)} unit="ftin" onUnitChange={() => {}} />,
    );
    fireEvent.click(getByLabelText("Decrease ft"));
    fireEvent.click(getByLabelText("Decrease in"));
    // 0cm decomposes to 0ft 0in; stepping down must clamp at 0, not go negative.
    expect(seen.every((n) => n !== null && n >= 0)).toBe(true);
  });
});
