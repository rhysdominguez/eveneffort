import { describe, it, expect } from "vitest";
import { duBoisBSA, frontalArea } from "./bsa";

describe("duBoisBSA", () => {
  it("matches the Du Bois reference for 70 kg / 175 cm (~1.85 m²)", () => {
    expect(duBoisBSA(70, 175)).toBeCloseTo(1.85, 2);
  });

  it("increases with both mass and height", () => {
    expect(duBoisBSA(80, 175)).toBeGreaterThan(duBoisBSA(70, 175));
    expect(duBoisBSA(70, 185)).toBeGreaterThan(duBoisBSA(70, 175));
  });
});

describe("frontalArea", () => {
  it("is 0.266 × BSA (~0.49 m² for the default runner)", () => {
    expect(frontalArea(70, 175)).toBeCloseTo(0.266 * duBoisBSA(70, 175), 10);
    expect(frontalArea(70, 175)).toBeCloseTo(0.49, 2);
  });
});
