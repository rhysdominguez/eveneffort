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

  it("steps the blank cm field from the default height, not from zero", () => {
    const seen: (number | null)[] = [];
    const { getByLabelText } = render(
      <HeightField value={null} onChange={(n) => seen.push(n)} unit="cm" onUnitChange={() => {}} />,
    );
    fireEvent.click(getByLabelText("Increase Height"));
    expect(seen).toEqual([176]);
  });

  it("shows the default height (5'9\") as ft/in placeholders while unset", () => {
    const { getByLabelText } = render(
      <HeightField value={null} onChange={() => {}} unit="ftin" onUnitChange={() => {}} />,
    );
    expect((getByLabelText("ft") as HTMLInputElement).value).toBe("");
    expect((getByLabelText("ft") as HTMLInputElement).placeholder).toBe("5");
    expect((getByLabelText("in") as HTMLInputElement).value).toBe("");
    expect((getByLabelText("in") as HTMLInputElement).placeholder).toBe("9");
  });

  it("steps the blank ft/in field from the default height, filling in the whole default", () => {
    const seen: (number | null)[] = [];
    const { getByLabelText } = render(
      <HeightField value={null} onChange={(n) => seen.push(n)} unit="ftin" onUnitChange={() => {}} />,
    );
    // Default 175cm ≈ 5'9". Bumping inches to 10 should land near 178cm, not
    // near 3cm (0'1").
    fireEvent.click(getByLabelText("Increase in"));
    expect(seen[0]).toBeGreaterThan(170);
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
