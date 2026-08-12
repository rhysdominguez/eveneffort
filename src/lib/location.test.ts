import { describe, it, expect } from "vitest";
import { formatLocation, subdivisionCode } from "./location";

describe("subdivisionCode", () => {
  it("drops the country prefix an ISO 3166-2 code carries", () => {
    expect(subdivisionCode("US-CA")).toBe("CA");
    expect(subdivisionCode("CA-ON")).toBe("ON");
    expect(subdivisionCode("AU-NSW")).toBe("NSW");
  });

  it("leaves a bare code alone", () => {
    expect(subdivisionCode("ON")).toBe("ON");
  });
});

describe("formatLocation", () => {
  it("includes the region code when present, without its country prefix", () => {
    // The seed stores full ISO 3166-2 codes; "Santa Rosa, US-CA, United
    // States" is what shipped before this was trimmed at display time.
    expect(formatLocation("Toronto", "CA-ON", "Canada")).toBe(
      "Toronto, ON, Canada",
    );
    expect(formatLocation("Santa Rosa", "US-CA", "United States")).toBe(
      "Santa Rosa, CA, United States",
    );
  });

  it("omits the region when null", () => {
    expect(formatLocation("Berlin", null, "Germany")).toBe("Berlin, Germany");
  });
});
