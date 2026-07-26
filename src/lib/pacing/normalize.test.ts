import { describe, it, expect } from "vitest";
import { normalizePaces } from "./normalize";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("normalizePaces", () => {
  it("makes the total equal the goal time exactly (several inputs)", () => {
    expect(sum(normalizePaces([1, 2, 3, 4], 100))).toBeCloseTo(100, 9);
    expect(sum(normalizePaces([10, 10, 10], 12600))).toBeCloseTo(12600, 9);
    expect(sum(normalizePaces([0.5, 7, 0.001, 99], 4242))).toBeCloseTo(4242, 9);
  });

  it("is a no-op when input already sums to the goal", () => {
    const input = [30, 40, 30];
    const out = normalizePaces(input, 100);
    out.forEach((v, i) => expect(v).toBeCloseTo(input[i], 9));
  });

  it("preserves relative ratios between segments", () => {
    const input = [2, 5, 8, 11];
    const out = normalizePaces(input, 999);
    expect(out[0] / out[1]).toBeCloseTo(input[0] / input[1], 9);
    expect(out[3] / out[2]).toBeCloseTo(input[3] / input[2], 9);
  });
});
