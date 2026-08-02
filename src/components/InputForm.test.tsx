import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { InputForm } from "./InputForm";
import type { PacingInput } from "@/types";

// Weather/Wind and Fueling are dashboard-only (live mode) — the homepage
// form is core race setup + Calculate. The disclosure is collapsed by
// default, and jsdom has no network, so these assertions are structural: one
// merged section exists, expanding it reveals both weather and body-metric
// fields together, body metrics are inert (and therefore disabled) while
// weather is off, and the per-field unit toggles convert what's displayed.
const openSection = () => {
  const utils = render(<InputForm onChange={() => {}} />);
  fireEvent.click(utils.getByText(/Weather & Wind/));
  return utils;
};

describe("InputForm — Weather & Wind", () => {
  it("renders exactly one merged disclosure, not separate Weather/Advanced sections", () => {
    const { container } = render(<InputForm onChange={() => {}} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Weather & Wind");
    expect(text).not.toContain("Advanced");
  });

  it("shows both weather and body-metric fields once expanded", () => {
    const { getByLabelText } = openSection();
    for (const label of [
      "Temp",
      "Humidity (%)",
      "Wind",
      "Wind dir (°)",
      "Weight",
      "Height",
    ]) {
      expect(getByLabelText(label)).toBeTruthy();
    }
  });

  it("does not render any of the removed filler copy", () => {
    const { container } = openSection();
    const text = container.textContent ?? "";
    expect(text).not.toContain("pacing adjusts for elevation only");
    expect(text).not.toContain("km · °C · km/h");
    expect(text).not.toContain("over the race");
    expect(text).not.toContain("assumed fall-morning");
  });

  it("hides Weather & Wind on the homepage (button mode) but shows it on the dashboard (live mode)", () => {
    const button = render(<InputForm onCalculate={() => {}} />);
    const live = render(<InputForm onChange={() => {}} />);
    expect(button.container.textContent).not.toContain("Weather & Wind");
    expect(live.container.textContent).toContain("Weather & Wind");
  });
});

// The hero form sits low in the photo band, so its date/time panels open
// upward; the dashboard sidebar has room below and keeps the default. The
// panel only mounts while open, so each case has to click the trigger.
describe("InputForm — date/time popover placement", () => {
  // There is no auto-cleanup in this project, so a second render would leave
  // two forms mounted and getByText would match both — hence the unmount.
  const panelClassFor = (live: boolean, label: RegExp): string => {
    const utils = render(
      live ? <InputForm onChange={() => {}} /> : <InputForm onCalculate={() => {}} />,
    );
    fireEvent.click(utils.getByText(label));
    const panel = utils.container.querySelector('[role="dialog"]');
    const className = panel?.className ?? "";
    utils.unmount();
    return className;
  };

  it("opens the calendar upward on the homepage", () => {
    const className = panelClassFor(false, /Select a date/);
    expect(className).toContain("bottom-full");
    expect(className).not.toContain("top-full");
  });

  it("opens the time panel upward on the homepage", () => {
    const className = panelClassFor(false, /Select a time/);
    expect(className).toContain("bottom-full");
    expect(className).not.toContain("top-full");
  });

  it("leaves both opening downward on the dashboard", () => {
    for (const label of [/Select a date/, /Select a time/]) {
      const className = panelClassFor(true, label);
      expect(className).toContain("top-full");
      expect(className).not.toContain("bottom-full");
    }
  });
});

describe("InputForm — body metrics gated on weather", () => {
  it("disables weight and height while weather is off (they only feed the drag model)", () => {
    const { getByLabelText } = openSection();
    expect((getByLabelText("Weight") as HTMLInputElement).disabled).toBe(true);
    expect((getByLabelText("Height") as HTMLInputElement).disabled).toBe(true);
  });

  it("explains why weight and height are asked for, alongside those fields", () => {
    const { container } = openSection();
    expect(container.textContent).toContain(
      "Your weight and height determine how much the wind slows you down",
    );
  });

  it("enables them once weather is switched on", () => {
    const { getByLabelText, getByText } = openSection();
    fireEvent.click(getByText("Manual"));
    expect((getByLabelText("Weight") as HTMLInputElement).disabled).toBe(false);
    expect((getByLabelText("Height") as HTMLInputElement).disabled).toBe(false);
  });

  it("disables the weather fields too while off, and enables them together", () => {
    const { getByLabelText, getByText } = openSection();
    expect((getByLabelText("Temp") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(getByText("Manual"));
    expect((getByLabelText("Temp") as HTMLInputElement).disabled).toBe(false);
  });
});

describe("InputForm — Weather forecast mode is read-only", () => {
  it("keeps the weather fields disabled in forecast mode, unlike manual entry", () => {
    const { getByLabelText, getByText } = openSection();
    fireEvent.click(getByText("Forecast"));
    expect((getByLabelText("Temp") as HTMLInputElement).disabled).toBe(true);
    expect((getByLabelText("Wind") as HTMLInputElement).disabled).toBe(true);
  });

  it("still enables body metrics in forecast mode — they're never provided by the API", () => {
    const { getByLabelText, getByText } = openSection();
    fireEvent.click(getByText("Forecast"));
    expect((getByLabelText("Weight") as HTMLInputElement).disabled).toBe(false);
    expect((getByLabelText("Height") as HTMLInputElement).disabled).toBe(false);
  });

  it("shows mode-specific helper text that updates as the selection changes", () => {
    const { getByText, container } = openSection();
    fireEvent.click(getByText("Forecast"));
    expect(container.textContent).toContain(
      "Add a race date and start time for a live forecast.",
    );

    fireEvent.click(getByText("Manual"));
    expect(container.textContent).toContain("Enter conditions below.");
    expect(container.textContent).not.toContain(
      "Add a race date and start time",
    );

    fireEvent.click(getByText("Off"));
    expect(container.textContent).not.toContain("Enter conditions below.");
  });
});

describe("InputForm — per-field unit toggles", () => {
  it("offers independent distance, temperature, wind speed and weight toggles", () => {
    const { getByLabelText } = openSection();
    expect(getByLabelText("Distance unit")).toBeTruthy();
    expect(getByLabelText("Temperature unit")).toBeTruthy();
    expect(getByLabelText("Wind speed unit")).toBeTruthy();
    expect(getByLabelText("Weight unit")).toBeTruthy();
  });

  it("converts the weight value when switching to lb, leaving height alone", () => {
    const { getByLabelText, getByText } = openSection();
    fireEvent.click(getByText("Manual"));
    const weight = getByLabelText("Weight") as HTMLInputElement;
    fireEvent.change(weight, { target: { value: "70" } });
    expect(weight.value).toBe("70");

    fireEvent.click(getByText("lb"));
    expect((getByLabelText("Weight") as HTMLInputElement).value).toBe("154");
    // Height has its own toggle now — it must not follow the weight unit.
    expect(getByLabelText("Height")).toBeTruthy();
  });

  it("converts temperature independently of the distance unit", () => {
    const { getByLabelText, getByText } = openSection();
    fireEvent.click(getByText("Manual"));
    const temp = getByLabelText("Temp") as HTMLInputElement;
    fireEvent.change(temp, { target: { value: "15" } });

    fireEvent.click(getByText("°F"));
    expect((getByLabelText("Temp") as HTMLInputElement).value).toBe("59");
    // Wind speed has its own independent toggle now.
    expect(getByLabelText("Wind speed unit")).toBeTruthy();

    fireEvent.click(getByText("°C"));
    expect((getByLabelText("Temp") as HTMLInputElement).value).toBe("15");
  });

  it("allows independent control of wind speed unit", () => {
    const { getByLabelText, getByText } = openSection();
    fireEvent.click(getByText("Manual"));
    expect(getByLabelText("Wind speed unit")).toBeTruthy();
    // Wind speed unit is not tied to distance unit anymore.
    fireEvent.click(getByText("mi"));
    expect(getByLabelText("Wind speed unit")).toBeTruthy();
  });
});

describe("InputForm — height in feet and inches", () => {
  it("has its own toggle, independent of weight", () => {
    const { getByLabelText } = openSection();
    expect(getByLabelText("Height unit")).toBeTruthy();
    expect(getByLabelText("Weight unit")).toBeTruthy();
  });

  it("splits into a feet + inches pair in imperial", () => {
    const { getByLabelText, getByText, queryByLabelText } = openSection();
    fireEvent.click(getByText("Manual"));
    fireEvent.change(getByLabelText("Height"), { target: { value: "175" } });

    fireEvent.click(getByText("ft"));
    // The single cm field is replaced by two parts.
    expect(queryByLabelText("Height")).toBeNull();
    expect((getByLabelText("ft") as HTMLInputElement).value).toBe("5");
    expect((getByLabelText("in") as HTMLInputElement).value).toBe("9");
  });

  it("round-trips back to centimetres within half an inch", () => {
    const { getByLabelText, getByText } = openSection();
    fireEvent.click(getByText("Manual"));
    fireEvent.change(getByLabelText("Height"), { target: { value: "175" } });
    fireEvent.click(getByText("ft"));
    fireEvent.click(getByText("cm"));
    const cm = Number((getByLabelText("Height") as HTMLInputElement).value);
    expect(Math.abs(cm - 175)).toBeLessThan(1.28);
  });

  it("recomputes centimetres when either part is edited", () => {
    const { getByLabelText, getByText } = openSection();
    fireEvent.click(getByText("Manual"));
    fireEvent.click(getByText("ft"));
    fireEvent.change(getByLabelText("ft"), { target: { value: "6" } });
    fireEvent.change(getByLabelText("in"), { target: { value: "0" } });
    fireEvent.click(getByText("cm"));
    const cm = Number((getByLabelText("Height") as HTMLInputElement).value);
    expect(cm).toBeCloseTo(182.88, 2);
  });
});

// Fueling lives in its own disclosure, collapsed by default like Weather &
// Wind, and is likewise dashboard-only (live mode). Opening only this one
// keeps the "On"/"Off" buttons unambiguous.
const openFueling = () => {
  const utils = render(<InputForm onChange={() => {}} />);
  fireEvent.click(utils.getByText(/Fueling Strategy/));
  return utils;
};

describe("InputForm — Fueling strategy", () => {
  it("is hidden on the homepage (button mode)", () => {
    const { container } = render(<InputForm onCalculate={() => {}} />);
    expect(container.textContent).not.toContain("Fueling Strategy");
  });

  it("starts collapsed, with no rate shown in the header", () => {
    const { container } = render(<InputForm onChange={() => {}} />);
    expect(container.textContent).toContain("Fueling Strategy");
    expect(container.textContent).not.toContain("g/hr)");
    // Collapsed ⇒ the slider itself isn't mounted yet.
    expect(container.querySelector("#carbs-per-hour")).toBeNull();
  });

  it("exposes a 30–100 slider in steps of 5", () => {
    const { getByLabelText } = openFueling();
    const slider = getByLabelText("Carbs per hour") as HTMLInputElement;
    expect(slider.type).toBe("range");
    expect(slider.min).toBe("30");
    expect(slider.max).toBe("100");
    expect(slider.step).toBe("5");
    expect(slider.value).toBe("60");
  });

  it("restates the rate as a gel interval as it changes", () => {
    const { getByLabelText, container } = openFueling();
    const slider = getByLabelText("Carbs per hour");

    expect(container.textContent).toContain("About one gel every 25 min");

    fireEvent.change(slider, { target: { value: "100" } });
    expect(container.textContent).toContain("100 g/hr");
    expect(container.textContent).toContain("About one gel every 15 min");

    fireEvent.change(slider, { target: { value: "30" } });
    expect(container.textContent).toContain("About one gel every 50 min");
  });

  it("disables the slider when fueling is switched off", () => {
    const { getByLabelText, getByText } = openFueling();
    const slider = getByLabelText("Carbs per hour") as HTMLInputElement;
    expect(slider.disabled).toBe(false);
    fireEvent.click(getByText("Off"));
    expect(slider.disabled).toBe(true);
  });

  it("emits fueling by default and drops it once switched off", () => {
    const seen: PacingInput[] = [];
    const { getByText } = render(<InputForm onChange={(i) => seen.push(i)} />);
    expect(seen.at(-1)?.fueling).toEqual({ carbsPerHour: 60 });

    fireEvent.click(getByText(/Fueling Strategy/));
    fireEvent.click(getByText("Off"));
    expect(seen.at(-1)?.fueling).toBeUndefined();
  });
});
