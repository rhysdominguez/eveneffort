import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { InputForm } from "./InputForm";
import type { PacingInput } from "@/types";
import { FIXTURE_CATALOG } from "@/data/courses.fixture";
import { clearStoredState } from "@/test/storage";
import { writeState } from "@/lib/clientState";
import { DISPLAY_UNITS, HOME_FORM } from "@/lib/stateKeys";

// Weather/Wind and Fueling are dashboard-only (live mode) — the homepage
// form is core race setup + Calculate. Both are permanently expanded, and
// jsdom has no network, so these assertions are structural: one merged
// section exists, showing both weather and body-metric fields together, body
// metrics are inert (and therefore disabled) while weather is off, and the
// per-field unit toggles convert what's displayed.
// The display-unit toggles persist to localStorage, and jsdom shares one
// store across every test in a file — so flipping to feet in one test would
// otherwise open the next one already in feet.
beforeEach(clearStoredState);

const openSection = () =>
  render(<InputForm catalog={FIXTURE_CATALOG} onChange={() => {}} />);

// Both sections are on screen at once now, so "Off" is ambiguous — it's both
// a weather mode and the fueling switch. Scope to the section under test.
const section = (container: HTMLElement, heading: RegExp) =>
  within(within(container).getByText(heading).closest("div")!);

describe("InputForm — Weather & Wind", () => {
  it("renders exactly one merged disclosure, not separate Weather/Advanced sections", () => {
    const { container } = render(
      <InputForm catalog={FIXTURE_CATALOG} onChange={() => {}} />,
    );
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
    const button = render(
      <InputForm catalog={FIXTURE_CATALOG} onCalculate={() => {}} />,
    );
    const live = render(
      <InputForm catalog={FIXTURE_CATALOG} onChange={() => {}} />,
    );
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
      live ? (
        <InputForm catalog={FIXTURE_CATALOG} onChange={() => {}} />
      ) : (
        <InputForm catalog={FIXTURE_CATALOG} onCalculate={() => {}} />
      ),
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

    fireEvent.click(section(container, /Weather & Wind/).getByText("Off"));
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

// Fueling is its own permanently-expanded section, dashboard-only (live
// mode) like Weather & Wind.
const openFueling = () =>
  render(<InputForm catalog={FIXTURE_CATALOG} onChange={() => {}} />);

describe("InputForm — Fueling strategy", () => {
  it("is hidden on the homepage (button mode)", () => {
    const { container } = render(
      <InputForm catalog={FIXTURE_CATALOG} onCalculate={() => {}} />,
    );
    expect(container.textContent).not.toContain("Fueling Strategy");
  });

  it("is expanded from the start, with no disclosure to click", () => {
    const { container, getByText } = render(
      <InputForm catalog={FIXTURE_CATALOG} onChange={() => {}} />,
    );
    expect(container.querySelector("#carbs-per-hour")).not.toBeNull();
    // Both headings are plain labels now, not disclosure toggles.
    expect(getByText(/Fueling Strategy/).closest("button")).toBeNull();
    expect(getByText(/Weather & Wind/).closest("button")).toBeNull();
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
    const { getByLabelText, container } = openFueling();
    const slider = getByLabelText("Carbs per hour") as HTMLInputElement;
    expect(slider.disabled).toBe(false);
    fireEvent.click(section(container, /Fueling Strategy/).getByText("Off"));
    expect(slider.disabled).toBe(true);
  });

  it("emits fueling by default and drops it once switched off", () => {
    const seen: PacingInput[] = [];
    const { container } = render(
      <InputForm catalog={FIXTURE_CATALOG} onChange={(i) => seen.push(i)} />,
    );
    expect(seen.at(-1)?.fueling).toEqual({ carbsPerHour: 60 });

    fireEvent.click(section(container, /Fueling Strategy/).getByText("Off"));
    expect(seen.at(-1)?.fueling).toBeUndefined();
  });
});

// The catalog now carries each course's next scheduled edition, so choosing a
// race can fill in its date. The rule that matters is that it never clobbers a
// date the runner chose themselves.
describe("InputForm — race date prefill from the next edition", () => {
  // The course picker is a search combobox now, so a change is typed and
  // confirmed rather than set as a `<select>` value.
  const pickCourse = (container: HTMLElement, displayName: string) => {
    const input = container.querySelector("#course") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: displayName } });
    fireEvent.keyDown(input, { key: "Enter" });
  };

  const withDates = FIXTURE_CATALOG.map((c, i) => ({
    ...c,
    nextRaceDateISO: `2026-0${i + 1}-11`,
  }));

  it("seeds the date from the initially selected course", () => {
    const seen: PacingInput[] = [];
    render(<InputForm catalog={withDates} onChange={(i) => seen.push(i)} />);
    expect(seen.at(-1)?.raceDateISO).toBe(withDates[0].nextRaceDateISO);
  });

  it("moves the date when the course changes", () => {
    const seen: PacingInput[] = [];
    const { container } = render(
      <InputForm catalog={withDates} onChange={(i) => seen.push(i)} />,
    );
    pickCourse(container, withDates[2].displayName);
    expect(seen.at(-1)?.courseId).toBe(withDates[2].id);
    expect(seen.at(-1)?.raceDateISO).toBe(withDates[2].nextRaceDateISO);
  });

  it("never overwrites a date carried in from a shared URL", () => {
    const seen: PacingInput[] = [];
    const initial: PacingInput = {
      courseId: withDates[0].id,
      unit: "km",
      goalTimeSeconds: 14400,
      raceDateISO: "2026-12-25",
    };
    const { container } = render(
      <InputForm
        catalog={withDates}
        initial={initial}
        onChange={(i) => seen.push(i)}
      />,
    );
    expect(seen.at(-1)?.raceDateISO).toBe("2026-12-25");

    // Still the runner's date after switching course — their choice wins.
    pickCourse(container, withDates[3].displayName);
    expect(seen.at(-1)?.raceDateISO).toBe("2026-12-25");
  });

  it("leaves the date blank when a course has no scheduled edition", () => {
    const seen: PacingInput[] = [];
    render(
      <InputForm catalog={FIXTURE_CATALOG} onChange={(i) => seen.push(i)} />,
    );
    expect(seen.at(-1)?.raceDateISO).toBeUndefined();
  });
});

// The hero form remembers what was typed into it across a navigation away and
// back. The dashboard's copy never does — there, `initial` comes from the query
// string, and a shared link has to mean the same thing to everyone who opens it.
describe("InputForm — remembering the hero form", () => {
  const pickCourse = (container: HTMLElement, displayName: string) => {
    const input = container.querySelector("#course") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: displayName } });
    fireEvent.keyDown(input, { key: "Enter" });
  };

  const typeGoal = (
    { getByLabelText }: ReturnType<typeof render>,
    hours: string,
    minutes: string,
  ) => {
    fireEvent.change(getByLabelText("hours"), { target: { value: hours } });
    fireEvent.change(getByLabelText("minutes"), { target: { value: minutes } });
  };

  const hero = () =>
    render(<InputForm catalog={FIXTURE_CATALOG} persist onCalculate={() => {}} />);

  it("comes back to the goal time that was typed", () => {
    const first = hero();
    typeGoal(first, "3", "45");
    first.unmount();

    const second = hero();
    expect(
      (second.getByLabelText("hours") as HTMLInputElement).value,
    ).toBe("3");
    expect(
      (second.getByLabelText("minutes") as HTMLInputElement).value,
    ).toBe("45");
  });

  it("comes back to the course that was chosen", () => {
    const first = hero();
    pickCourse(first.container, FIXTURE_CATALOG[2].displayName);
    first.unmount();

    const second = hero();
    expect(
      (second.container.querySelector("#course") as HTMLInputElement).value,
    ).toContain(FIXTURE_CATALOG[2].displayName);
  });

  it("opens on its own defaults when nothing was ever typed", () => {
    const { getByLabelText } = hero();
    expect((getByLabelText("hours") as HTMLInputElement).value).toBe("4");
    expect((getByLabelText("minutes") as HTMLInputElement).value).toBe("0");
  });

  it("does not remember anything without the persist flag", () => {
    // The dashboard's copy of this form. Typing here must leave no trace, or a
    // session snapshot would start overriding shared /results links.
    const first = render(
      <InputForm catalog={FIXTURE_CATALOG} onChange={() => {}} />,
    );
    typeGoal(first, "3", "45");
    first.unmount();
    expect(window.sessionStorage.getItem(HOME_FORM.key)).toBeNull();

    const second = hero();
    expect((second.getByLabelText("hours") as HTMLInputElement).value).toBe("4");
  });

  it("lets a URL-seeded dashboard form beat a stored hero snapshot", () => {
    const first = hero();
    typeGoal(first, "3", "45");
    first.unmount();

    // Same tab, same session store — but this form is driven by the query
    // string and must show exactly what the link said.
    const initial: PacingInput = {
      courseId: FIXTURE_CATALOG[0].id,
      unit: "km",
      goalTimeSeconds: 5 * 3600,
    };
    const dash = render(
      <InputForm
        catalog={FIXTURE_CATALOG}
        initial={initial}
        onChange={() => {}}
      />,
    );
    expect((dash.getByLabelText("hours") as HTMLInputElement).value).toBe("5");
  });

  it("falls back to the default course when the stored one has left the catalog", () => {
    // Courses are database rows; a slug can leave the seed between two visits.
    writeState(HOME_FORM, {
      courseId: "a-race-we-no-longer-hold",
      goalTime: { hours: 3, minutes: 45, seconds: 0 },
      unit: "km",
      raceDate: "",
      raceStartTime: "",
    });
    const { container, getByLabelText } = hero();
    expect(
      (container.querySelector("#course") as HTMLInputElement).value,
    ).toContain(FIXTURE_CATALOG[0].displayName);
    // The rest of the snapshot still applies — one dead slug is not a reason to
    // throw away a goal time.
    expect((getByLabelText("hours") as HTMLInputElement).value).toBe("3");
  });

  it("ignores a stored snapshot that no longer parses", () => {
    window.sessionStorage.setItem(HOME_FORM.key, '{"goalTime":"3:45"}');
    const { getByLabelText } = hero();
    expect((getByLabelText("hours") as HTMLInputElement).value).toBe("4");
  });
});

// Display units are the one preference that outlives the tab, and the one that
// persists on BOTH pages.
describe("InputForm — remembering display units", () => {
  const dashboard = () =>
    render(<InputForm catalog={FIXTURE_CATALOG} onChange={() => {}} />);

  it("comes back to the temperature unit that was chosen", () => {
    const first = dashboard();
    fireEvent.click(first.getByText("Manual"));
    fireEvent.click(first.getByText("°F"));
    first.unmount();

    const second = dashboard();
    fireEvent.click(second.getByText("Manual"));
    expect(
      window.localStorage.getItem(DISPLAY_UNITS.key),
    ).toContain('"tempUnit":"F"');
    expect(
      (second.getByText("°F") as HTMLElement).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("stores the preference in localStorage, not the session", () => {
    // The durability decision, asserted where it is visible: a runner who
    // prefers °F should not have to re-pick it next week.
    const first = dashboard();
    fireEvent.click(first.getByText("Manual"));
    fireEvent.click(first.getByText("°F"));
    expect(window.localStorage.getItem(DISPLAY_UNITS.key)).not.toBeNull();
    expect(window.sessionStorage.getItem(DISPLAY_UNITS.key)).toBeNull();
  });

  it("still guesses from the distance unit on a first visit", () => {
    const initial: PacingInput = {
      courseId: FIXTURE_CATALOG[0].id,
      unit: "miles",
      goalTimeSeconds: 14400,
    };
    const { getByText } = render(
      <InputForm
        catalog={FIXTURE_CATALOG}
        initial={initial}
        onChange={() => {}}
      />,
    );
    fireEvent.click(getByText("Manual"));
    expect(getByText("°F").getAttribute("aria-pressed")).toBe("true");
  });

  it("lets a stored preference beat that guess", () => {
    writeState(DISPLAY_UNITS, {
      tempUnit: "C",
      speedUnit: "kph",
      weightUnit: "kg",
      heightUnit: "cm",
    });
    const initial: PacingInput = {
      courseId: FIXTURE_CATALOG[0].id,
      unit: "miles",
      goalTimeSeconds: 14400,
    };
    const { getByText } = render(
      <InputForm
        catalog={FIXTURE_CATALOG}
        initial={initial}
        onChange={() => {}}
      />,
    );
    fireEvent.click(getByText("Manual"));
    expect(getByText("°C").getAttribute("aria-pressed")).toBe("true");
  });
});

// Weather mode is the one weather setting the URL cannot carry: temp/hum/wind
// always parse back as "manual", so a runner who chose Forecast used to lose it
// on any reload — including the cold load Stripe's cancel_url produces.
describe("InputForm — remembering weather mode", () => {
  // FIXTURE_CATALOG carries no scheduled editions, so raceDate stays empty and
  // useWeather's `if (!dateISO || !startTime) return` guard means no fetch is
  // ever attempted here.
  const dashboard = (initial?: PacingInput) =>
    render(
      <InputForm
        catalog={FIXTURE_CATALOG}
        initial={initial}
        onChange={() => {}}
      />,
    );

  // "Off" names both a weather mode and the fueling switch, so mode assertions
  // are scoped to the Weather & Wind section the same way the tests above are.
  const weather = (r: ReturnType<typeof render>) =>
    section(r.container, /Weather & Wind/);
  const pressed = (r: ReturnType<typeof render>, label: string) =>
    weather(r).getByText(label).getAttribute("aria-pressed");

  it("comes back in Forecast mode after a reload", () => {
    const first = dashboard();
    fireEvent.click(weather(first).getByText("Forecast"));
    first.unmount();

    expect(pressed(dashboard(), "Forecast")).toBe("true");
  });

  it("does not restore Manual over what the URL said", () => {
    // Manual IS expressible in the query string, so the link is authoritative
    // and a stale session choice must not contradict it.
    const first = dashboard();
    fireEvent.click(weather(first).getByText("Manual"));
    first.unmount();

    expect(pressed(dashboard(), "Off")).toBe("true");
  });

  it("does not restore Off either", () => {
    const first = dashboard();
    fireEvent.click(weather(first).getByText("Forecast"));
    fireEvent.click(weather(first).getByText("Off"));
    first.unmount();

    const initial: PacingInput = {
      courseId: FIXTURE_CATALOG[0].id,
      unit: "km",
      goalTimeSeconds: 14400,
      weather: { tempC: 20, humidity: 60, windSpeed: 3, windDirection: 90 },
    };
    // A shared link carrying conditions still opens in manual, as it always has.
    expect(pressed(dashboard(initial), "Manual")).toBe("true");
  });

  it("leaves the hero form alone", () => {
    // The hero hides the weather section entirely, and restoring "forecast"
    // there would fire a forecast request for a race nobody has committed to.
    const first = dashboard();
    fireEvent.click(weather(first).getByText("Forecast"));
    first.unmount();

    const heroForm = render(
      <InputForm catalog={FIXTURE_CATALOG} persist onCalculate={() => {}} />,
    );
    expect(heroForm.queryByText("Forecast")).toBeNull();
  });
});
