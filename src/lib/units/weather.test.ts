import { describe, it, expect } from "vitest";
import {
  cmToFeetInches,
  feetInchesToCm,
  heightUnitLabel,
  massFromDisplay,
  massToDisplay,
  roundForDisplay,
  speedUnitForDistance,
  tempFromDisplay,
  tempToDisplay,
  tempUnitLabel,
  windFromDisplay,
  windToDisplay,
  windUnitLabel,
} from "./weather";

describe("inherited units", () => {
  it("derives wind speed unit from the distance unit", () => {
    expect(speedUnitForDistance("km")).toBe("kph");
    expect(speedUnitForDistance("miles")).toBe("mph");
  });

});

describe("temperature conversion", () => {
  it("is identity in Celsius", () => {
    expect(tempToDisplay(15, "C")).toBe(15);
    expect(tempFromDisplay(15, "C")).toBe(15);
  });

  it("hits the known Fahrenheit anchors", () => {
    expect(tempToDisplay(0, "F")).toBeCloseTo(32, 9);
    expect(tempToDisplay(100, "F")).toBeCloseTo(212, 9);
    expect(tempToDisplay(-40, "F")).toBeCloseTo(-40, 9); // the crossover
    expect(tempToDisplay(37, "F")).toBeCloseTo(98.6, 9);
  });

  it("round-trips in both units", () => {
    for (const unit of ["C", "F"] as const) {
      for (const c of [-10, 0, 13, 15.5, 22, 35]) {
        expect(tempFromDisplay(tempToDisplay(c, unit), unit)).toBeCloseTo(c, 9);
      }
    }
  });

  it("inverts the display direction", () => {
    expect(tempFromDisplay(32, "F")).toBeCloseTo(0, 9);
    expect(tempFromDisplay(212, "F")).toBeCloseTo(100, 9);
  });
});

describe("wind conversion", () => {
  it("converts m/s to km/h", () => {
    expect(windToDisplay(1, "kph")).toBeCloseTo(3.6, 9);
    expect(windToDisplay(0, "kph")).toBe(0);
    expect(windToDisplay(10, "kph")).toBeCloseTo(36, 9);
  });

  it("converts m/s to mph", () => {
    expect(windToDisplay(1, "mph")).toBeCloseTo(2.236936, 5);
    expect(windToDisplay(10, "mph")).toBeCloseTo(22.36936, 4);
  });

  it("round-trips in both units", () => {
    for (const unit of ["kph", "mph"] as const) {
      for (const ms of [0, 0.5, 3, 8, 12.7]) {
        expect(windFromDisplay(windToDisplay(ms, unit), unit)).toBeCloseTo(
          ms,
          9,
        );
      }
    }
  });

  it("keeps a still day still in both units", () => {
    expect(windFromDisplay(0, "kph")).toBe(0);
    expect(windFromDisplay(0, "mph")).toBe(0);
  });
});

describe("body mass conversion", () => {
  it("is identity in kilograms", () => {
    expect(massToDisplay(70, "kg")).toBe(70);
    expect(massFromDisplay(70, "kg")).toBe(70);
  });

  it("hits the known pound anchors", () => {
    expect(massToDisplay(1, "lb")).toBeCloseTo(2.20462262, 7);
    expect(massToDisplay(70, "lb")).toBeCloseTo(154.32, 2);
    expect(massToDisplay(0, "lb")).toBe(0);
  });

  it("round-trips in both units", () => {
    for (const unit of ["kg", "lb"] as const) {
      for (const kg of [45, 58.5, 70, 92.3]) {
        expect(massFromDisplay(massToDisplay(kg, unit), unit)).toBeCloseTo(
          kg,
          9,
        );
      }
    }
  });
});

describe("height conversion (feet + inches)", () => {
  it("hits the known anchors", () => {
    expect(cmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
    expect(cmToFeetInches(175)).toEqual({ feet: 5, inches: 9 });
    expect(cmToFeetInches(160)).toEqual({ feet: 5, inches: 3 });
    expect(feetInchesToCm(6, 0)).toBeCloseTo(182.88, 9);
    expect(feetInchesToCm(5, 9)).toBeCloseTo(175.26, 9);
  });

  it("rolls 12 inches over into the next foot, never showing 5′12″", () => {
    // 182.7 cm is 71.93 in — rounding inches alone would give 5 ft 12.
    expect(cmToFeetInches(182.7)).toEqual({ feet: 6, inches: 0 });
    for (let cm = 100; cm <= 220; cm += 0.1) {
      const { inches } = cmToFeetInches(cm);
      expect(inches).toBeGreaterThanOrEqual(0);
      expect(inches).toBeLessThan(12);
    }
  });

  it("guards non-positive input", () => {
    expect(cmToFeetInches(0)).toEqual({ feet: 0, inches: 0 });
    expect(cmToFeetInches(-5)).toEqual({ feet: 0, inches: 0 });
    expect(cmToFeetInches(Number.NaN)).toEqual({ feet: 0, inches: 0 });
  });

  it("round-trips exactly for whole feet/inches", () => {
    for (const [ft, inch] of [
      [5, 0],
      [5, 9],
      [6, 2],
      [4, 11],
    ] as const) {
      const cm = feetInchesToCm(ft, inch);
      expect(cmToFeetInches(cm)).toEqual({ feet: ft, inches: inch });
    }
  });

  it("stays within half an inch when round-tripping arbitrary cm", () => {
    for (const cm of [150, 165.5, 175, 198]) {
      const { feet, inches } = cmToFeetInches(cm);
      expect(Math.abs(feetInchesToCm(feet, inches) - cm)).toBeLessThan(1.28);
    }
  });
});

describe("labels", () => {
  it("names each unit", () => {
    expect(tempUnitLabel("C")).toBe("°C");
    expect(tempUnitLabel("F")).toBe("°F");
    expect(windUnitLabel("kph")).toBe("km/h");
    expect(windUnitLabel("mph")).toBe("mph");
    expect(heightUnitLabel("cm")).toBe("cm");
    expect(heightUnitLabel("ftin")).toBe("ft");
  });
});

describe("roundForDisplay", () => {
  it("rounds to the nearest whole number", () => {
    expect(roundForDisplay(15)).toBe(15);
    expect(roundForDisplay(71.6)).toBe(72);
    expect(roundForDisplay(22.36936)).toBe(22);
    expect(roundForDisplay(-3.44)).toBe(-3);
  });

  it("produces a value that stringifies without a trailing .0", () => {
    expect(String(roundForDisplay(59.0))).toBe("59");
    expect(String(roundForDisplay(36))).toBe("36");
  });
});

describe("no drift when toggling units without editing", () => {
  it("survives repeated flips at full precision across every field", () => {
    let tempC = 22;
    let windMS = 4.4;
    let massKg = 70;
    for (let i = 0; i < 20; i++) {
      const flip = i % 2 === 0;
      // Simulating the UI boundary: convert out, then straight back in.
      const t = flip ? "F" : "C";
      const s = flip ? "mph" : "kph";
      const w = flip ? "lb" : "kg";
      tempC = tempFromDisplay(tempToDisplay(tempC, t), t);
      windMS = windFromDisplay(windToDisplay(windMS, s), s);
      massKg = massFromDisplay(massToDisplay(massKg, w), w);
    }
    expect(tempC).toBeCloseTo(22, 9);
    expect(windMS).toBeCloseTo(4.4, 9);
    expect(massKg).toBeCloseTo(70, 9);
  });

  // Height is the exception: feet+inches is a coarser representation than cm,
  // so a round-trip quantises. The UI never writes back on a mere toggle
  // (canonical cm is only rewritten when the user edits), so this quantisation
  // is bounded by the display step rather than accumulating.
  it("keeps height stable within its display step across repeated flips", () => {
    let heightCm = 175;
    for (let i = 0; i < 20; i++) {
      const { feet, inches } = cmToFeetInches(heightCm);
      heightCm = feetInchesToCm(feet, inches);
    }
    expect(Math.abs(heightCm - 175)).toBeLessThan(1.28); // < half an inch
  });
});
