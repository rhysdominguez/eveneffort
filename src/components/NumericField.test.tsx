import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { NumericField } from "./NumericField";

describe("NumericField — stepper", () => {
  it("increments and decrements by the default step of 1", () => {
    // Mirrors real usage: the parent owns state and re-renders with the
    // committed value, which is what lets a second click continue from 21
    // rather than re-deriving from the original prop each time.
    const seen: number[] = [];
    const { getByLabelText, rerender } = render(
      <NumericField id="x" label="Temp" value={20} onCommit={(n) => seen.push(n)} />,
    );
    fireEvent.click(getByLabelText("Increase Temp"));
    rerender(
      <NumericField id="x" label="Temp" value={seen[0]} onCommit={(n) => seen.push(n)} />,
    );
    fireEvent.click(getByLabelText("Increase Temp"));
    rerender(
      <NumericField id="x" label="Temp" value={seen[1]} onCommit={(n) => seen.push(n)} />,
    );
    fireEvent.click(getByLabelText("Decrease Temp"));
    expect(seen).toEqual([21, 22, 21]);
  });

  it("steps by a custom amount when provided", () => {
    const seen: number[] = [];
    const { getByLabelText } = render(
      <NumericField id="x" label="Wind" value={10} step={5} onCommit={(n) => seen.push(n)} />,
    );
    fireEvent.click(getByLabelText("Increase Wind"));
    expect(seen).toEqual([15]);
  });

  it("steps from zero when the field is blank", () => {
    const seen: number[] = [];
    const { getByLabelText } = render(
      <NumericField id="x" label="Humidity (%)" value={null} onCommit={(n) => seen.push(n)} />,
    );
    fireEvent.click(getByLabelText("Increase Humidity (%)"));
    expect(seen).toEqual([1]);
  });

  it("updates the visible input value, not just the callback", () => {
    const { getByLabelText, getByDisplayValue } = render(
      <NumericField id="x" label="Temp" value={20} onCommit={() => {}} />,
    );
    fireEvent.click(getByLabelText("Increase Temp"));
    expect(getByDisplayValue("21")).toBeTruthy();
  });

  it("disables both stepper buttons when the field is disabled", () => {
    const { getByLabelText } = render(
      <NumericField id="x" label="Temp" value={20} onCommit={() => {}} disabled />,
    );
    expect((getByLabelText("Increase Temp") as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText("Decrease Temp") as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not commit a step while disabled", () => {
    const seen: number[] = [];
    const { getByLabelText } = render(
      <NumericField id="x" label="Temp" value={20} onCommit={(n) => seen.push(n)} disabled />,
    );
    fireEvent.click(getByLabelText("Increase Temp"));
    expect(seen).toEqual([]);
  });
});

describe("NumericField — min/max bounds", () => {
  it("cannot type a minus sign when min is 0 (Weight, Height, Humidity, Wind)", () => {
    const seen: number[] = [];
    const { getByLabelText } = render(
      <NumericField id="x" label="Weight" value={70} min={0} onCommit={(n) => seen.push(n)} />,
    );
    const input = getByLabelText("Weight") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-1" } });
    expect(input.value).toBe("1");
    expect(seen).toEqual([1]);
  });

  it("still allows a minus sign when no min is set (Temp)", () => {
    const { getByLabelText } = render(
      <NumericField id="x" label="Temp" value={20} onCommit={() => {}} />,
    );
    const input = getByLabelText("Temp") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-5" } });
    expect(input.value).toBe("-5");
  });

  it("clamps the decrement stepper at min", () => {
    const seen: number[] = [];
    const { getByLabelText } = render(
      <NumericField id="x" label="Weight" value={0} min={0} onCommit={(n) => seen.push(n)} />,
    );
    fireEvent.click(getByLabelText("Decrease Weight"));
    expect(seen).toEqual([0]);
  });

  it("clamps the increment stepper at max (Humidity, Wind dir)", () => {
    const seen: number[] = [];
    const { getByLabelText } = render(
      <NumericField id="x" label="Humidity (%)" value={100} min={0} max={100} onCommit={(n) => seen.push(n)} />,
    );
    fireEvent.click(getByLabelText("Increase Humidity (%)"));
    expect(seen).toEqual([100]);
  });

  it("clamps a typed value above max on blur", () => {
    const seen: number[] = [];
    const { getByLabelText } = render(
      <NumericField id="x" label="Wind dir (°)" value={0} min={0} max={360} onCommit={(n) => seen.push(n)} />,
    );
    const input = getByLabelText("Wind dir (°)") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.blur(input);
    expect(input.value).toBe("360");
    expect(seen.at(-1)).toBe(360);
  });
});
