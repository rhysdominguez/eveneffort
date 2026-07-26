import { describe, it, expect } from "vitest";

// Sanity check: proves the Vitest runner is wired up correctly.
describe("sanity", () => {
  it("adds 1 + 1 to equal 2", () => {
    expect(1 + 1).toBe(2);
  });
});
