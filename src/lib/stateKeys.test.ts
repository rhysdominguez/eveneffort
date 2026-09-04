import { describe, it, expect, beforeEach } from "vitest";
import { readState, writeState } from "@/lib/clientState";
import {
  BQ_PROFILE,
  DISPLAY_UNITS,
  GOAL_MODE,
  HOME_CALENDAR,
  HOME_FORM,
  HOME_MAP_CAMERA,
  WEATHER_MODE,
  reviveGoalTime,
  revivePace,
  reviveLocationFilter,
  reviveMapCamera,
  reviveYearMonth,
} from "@/lib/stateKeys";
import { ALL_LOCATIONS } from "@/components/home/calendarFilters";
import { clearStoredState } from "@/test/storage";

// Every validator here guards a value that arrives from browser storage, which
// means it can be anything: written by a previous deploy, hand-edited in
// devtools, or truncated. The rule the whole module follows is that an invalid
// value comes back as null and the caller falls back to its default — never
// that a bad shape reaches a component that assumes a good one.

describe("stateKeys", () => {
  beforeEach(clearStoredState);

  describe("scopes", () => {
    it("keeps browsing state in sessionStorage and preferences in local", () => {
      // The one durability decision in the feature, asserted directly: filters
      // and a map camera describe a visit and should not greet someone weeks
      // later; preferring °F is about the runner and should.
      expect(HOME_CALENDAR.scope).toBe("session");
      expect(HOME_MAP_CAMERA.scope).toBe("session");
      expect(HOME_FORM.scope).toBe("session");
      expect(WEATHER_MODE.scope).toBe("session");
      expect(DISPLAY_UNITS.scope).toBe("local");
    });
  });

  describe("reviveLocationFilter", () => {
    it("accepts the unfiltered default and a fully narrowed filter", () => {
      expect(reviveLocationFilter(ALL_LOCATIONS)).toEqual(ALL_LOCATIONS);
      expect(
        reviveLocationFilter({
          continent: "NA",
          countryCode: "US",
          regionCode: "US-TX",
        }),
      ).toEqual({ continent: "NA", countryCode: "US", regionCode: "US-TX" });
    });

    it("accepts the 'Elsewhere' bucket", () => {
      expect(
        reviveLocationFilter({
          continent: "other",
          countryCode: null,
          regionCode: null,
        }),
      ).toEqual({ continent: "other", countryCode: null, regionCode: null });
    });

    it("rejects a continent that is not a real bucket", () => {
      expect(
        reviveLocationFilter({
          continent: "Atlantis",
          countryCode: null,
          regionCode: null,
        }),
      ).toBeNull();
    });

    it("rejects wrong types and non-objects", () => {
      expect(reviveLocationFilter(null)).toBeNull();
      expect(reviveLocationFilter("Europe")).toBeNull();
      expect(reviveLocationFilter([])).toBeNull();
      expect(
        reviveLocationFilter({
          continent: null,
          countryCode: 44,
          regionCode: null,
        }),
      ).toBeNull();
    });

    it("drops a region left without its country", () => {
      // Such a filter would narrow the calendar while the region select stays
      // hidden — an invisible filter, which reads as a broken calendar.
      expect(
        reviveLocationFilter({
          continent: null,
          countryCode: null,
          regionCode: "US-TX",
        }),
      ).toEqual(ALL_LOCATIONS);
    });
  });

  describe("reviveYearMonth", () => {
    it("accepts a real month", () => {
      expect(reviveYearMonth({ year: 2027, month: 3 })).toEqual({
        year: 2027,
        month: 3,
      });
    });

    it("rejects a month outside 1-12", () => {
      expect(reviveYearMonth({ year: 2027, month: 0 })).toBeNull();
      expect(reviveYearMonth({ year: 2027, month: 13 })).toBeNull();
    });

    it("rejects fractional and absurd values", () => {
      expect(reviveYearMonth({ year: 2027.5, month: 3 })).toBeNull();
      expect(reviveYearMonth({ year: 90000, month: 3 })).toBeNull();
      expect(reviveYearMonth({ year: Number.NaN, month: 3 })).toBeNull();
      expect(reviveYearMonth({ month: 3 })).toBeNull();
    });
  });

  describe("reviveMapCamera", () => {
    const camera = {
      center: [13.4, 52.5] as [number, number],
      zoom: 9.25,
      bearing: 0,
      pitch: 0,
    };

    it("accepts a real camera", () => {
      expect(reviveMapCamera(camera)).toEqual(camera);
    });

    // MapLibre throws on a bad camera, and it throws inside the build effect
    // where it takes the whole map band down — so these rejections are the
    // difference between a default view and an empty grey box.
    it("rejects an out-of-range latitude or longitude", () => {
      expect(reviveMapCamera({ ...camera, center: [13.4, 91] })).toBeNull();
      expect(reviveMapCamera({ ...camera, center: [181, 52.5] })).toBeNull();
    });

    it("rejects non-finite coordinates", () => {
      expect(
        reviveMapCamera({ ...camera, center: [Number.NaN, 52.5] }),
      ).toBeNull();
      expect(
        reviveMapCamera({ ...camera, center: [13.4, Number.POSITIVE_INFINITY] }),
      ).toBeNull();
    });

    it("rejects a malformed center", () => {
      expect(reviveMapCamera({ ...camera, center: [13.4] })).toBeNull();
      expect(reviveMapCamera({ ...camera, center: "13.4,52.5" })).toBeNull();
      expect(reviveMapCamera({ ...camera, center: [13.4, 52.5, 9] })).toBeNull();
    });

    it("rejects an out-of-range zoom or pitch", () => {
      expect(reviveMapCamera({ ...camera, zoom: 23 })).toBeNull();
      expect(reviveMapCamera({ ...camera, zoom: -1 })).toBeNull();
      expect(reviveMapCamera({ ...camera, pitch: 86 })).toBeNull();
    });

    it("rejects a camera missing a field entirely", () => {
      expect(reviveMapCamera({ center: [13.4, 52.5], zoom: 9 })).toBeNull();
    });
  });

  describe("revivePace", () => {
    it("accepts a pace, including a half-typed one", () => {
      expect(revivePace({ minutes: 5, seconds: 0 })).toEqual({
        minutes: 5,
        seconds: 0,
      });
      // Same "store what was TYPED" looseness as reviveGoalTime.
      expect(revivePace({ minutes: 0, seconds: 90 })).toEqual({
        minutes: 0,
        seconds: 90,
      });
    });

    it("rejects nonsense", () => {
      expect(revivePace({ minutes: 5 })).toBeNull();
      expect(revivePace({ minutes: -1, seconds: 0 })).toBeNull();
      expect(revivePace({ minutes: "5", seconds: 0 })).toBeNull();
      expect(revivePace(null)).toBeNull();
    });
  });

  describe("reviveGoalTime", () => {
    it("accepts a normal goal time", () => {
      expect(reviveGoalTime({ hours: 3, minutes: 45, seconds: 0 })).toEqual({
        hours: 3,
        minutes: 45,
        seconds: 0,
      });
    });

    it("accepts a half-finished entry", () => {
      // Looser than the form's own validation on purpose: this stores what was
      // TYPED. Someone who navigated away mid-edit should get their partial
      // entry back, and the form re-validates it exactly as it would a live
      // keystroke.
      expect(reviveGoalTime({ hours: 0, minutes: 0, seconds: 0 })).toEqual({
        hours: 0,
        minutes: 0,
        seconds: 0,
      });
      expect(reviveGoalTime({ hours: 3, minutes: 75, seconds: 0 })).toEqual({
        hours: 3,
        minutes: 75,
        seconds: 0,
      });
    });

    it("rejects nonsense", () => {
      expect(reviveGoalTime({ hours: 3, minutes: 45 })).toBeNull();
      expect(reviveGoalTime({ hours: -1, minutes: 0, seconds: 0 })).toBeNull();
      expect(reviveGoalTime({ hours: "3", minutes: 0, seconds: 0 })).toBeNull();
      expect(reviveGoalTime(null)).toBeNull();
    });
  });

  describe("stored key round-trips", () => {
    it("HOME_CALENDAR survives a write and read", () => {
      const value = {
        filter: { continent: "EU" as const, countryCode: "IT", regionCode: null },
        view: { year: 2027, month: 3 },
      };
      writeState(HOME_CALENDAR, value);
      expect(readState(HOME_CALENDAR)).toEqual(value);
    });

    it("HOME_CALENDAR rejects a snapshot with a broken half", () => {
      window.sessionStorage.setItem(
        HOME_CALENDAR.key,
        JSON.stringify({ filter: ALL_LOCATIONS, view: { year: 2027 } }),
      );
      expect(readState(HOME_CALENDAR)).toBeNull();
    });

    it("HOME_FORM survives a write and read", () => {
      const value = {
        courseId: "berlin-marathon",
        goalTime: { hours: 3, minutes: 45, seconds: 0 },
        unit: "miles" as const,
        raceDate: "2027-09-26",
        raceStartTime: "09:15",
      };
      writeState(HOME_FORM, value);
      expect(readState(HOME_FORM)).toEqual(value);
    });

    it("HOME_FORM rejects an unknown distance unit", () => {
      window.sessionStorage.setItem(
        HOME_FORM.key,
        JSON.stringify({
          courseId: "berlin-marathon",
          goalTime: { hours: 3, minutes: 45, seconds: 0 },
          unit: "furlongs",
          raceDate: "",
          raceStartTime: "",
        }),
      );
      expect(readState(HOME_FORM)).toBeNull();
    });

    it("DISPLAY_UNITS survives a write and read", () => {
      const value = {
        tempUnit: "F" as const,
        speedUnit: "mph" as const,
        weightUnit: "lb" as const,
        heightUnit: "ftin" as const,
        humidityUnit: "dew" as const,
      };
      writeState(DISPLAY_UNITS, value);
      expect(readState(DISPLAY_UNITS)).toEqual(value);
    });

    it("DISPLAY_UNITS rejects a partial preference", () => {
      window.localStorage.setItem(
        DISPLAY_UNITS.key,
        JSON.stringify({ tempUnit: "F" }),
      );
      expect(readState(DISPLAY_UNITS)).toBeNull();
    });

    // `humidityUnit` was added to this key after it shipped. A stored
    // preference written before that is a valid older shape, not corruption —
    // rejecting it would throw away the °F/lb/ft choice of everyone who had
    // already made one, which is the precise annoyance this key exists to
    // prevent. A present-but-wrong value is still rejected.
    it("DISPLAY_UNITS defaults humidityUnit for a preference stored before it existed", () => {
      window.localStorage.setItem(
        DISPLAY_UNITS.key,
        JSON.stringify({
          tempUnit: "F",
          speedUnit: "mph",
          weightUnit: "lb",
          heightUnit: "ftin",
        }),
      );
      expect(readState(DISPLAY_UNITS)).toEqual({
        tempUnit: "F",
        speedUnit: "mph",
        weightUnit: "lb",
        heightUnit: "ftin",
        humidityUnit: "rh",
      });
    });

    it("DISPLAY_UNITS rejects an unknown humidityUnit", () => {
      window.localStorage.setItem(
        DISPLAY_UNITS.key,
        JSON.stringify({
          tempUnit: "C",
          speedUnit: "kph",
          weightUnit: "kg",
          heightUnit: "cm",
          humidityUnit: "absolute",
        }),
      );
      expect(readState(DISPLAY_UNITS)).toBeNull();
    });

    it("GOAL_MODE accepts the three modes and nothing else", () => {
      for (const mode of ["time", "pace", "gap"] as const) {
        writeState(GOAL_MODE, mode);
        expect(readState(GOAL_MODE)).toBe(mode);
      }
      window.localStorage.setItem(GOAL_MODE.key, JSON.stringify("normalized"));
      expect(readState(GOAL_MODE)).toBeNull();
    });

    // Same reasoning as humidityUnit, but sharper: this key is SESSION-scoped,
    // so the snapshot at risk belongs to someone with the tab still open mid-
    // edit across a deploy.
    it("HOME_FORM keeps a snapshot written before the goal modes existed", () => {
      const legacy = {
        courseId: "boston",
        goalTime: { hours: 3, minutes: 30, seconds: 0 },
        unit: "km",
        raceDate: "2026-04-20",
        raceStartTime: "09:00",
      };
      window.sessionStorage.setItem(HOME_FORM.key, JSON.stringify(legacy));
      expect(readState(HOME_FORM)).toEqual(legacy);
    });

    it("HOME_FORM carries the goal mode and pace when they are present", () => {
      const value = {
        courseId: "boston",
        goalTime: { hours: 3, minutes: 30, seconds: 0 },
        goalPace: { minutes: 5, seconds: 0 },
        goalMode: "gap" as const,
        unit: "km" as const,
        raceDate: "2026-04-20",
        raceStartTime: "09:00",
      };
      writeState(HOME_FORM, value);
      expect(readState(HOME_FORM)).toEqual(value);
    });

    it("WEATHER_MODE accepts the three modes and nothing else", () => {
      for (const mode of ["forecast", "manual", "off"] as const) {
        writeState(WEATHER_MODE, mode);
        expect(readState(WEATHER_MODE)).toBe(mode);
      }
      window.sessionStorage.setItem(WEATHER_MODE.key, JSON.stringify("auto"));
      expect(readState(WEATHER_MODE)).toBeNull();
    });

    it("BQ_PROFILE roundtrips every division", () => {
      for (const division of ["men", "women", "nonbinary"] as const) {
        const value = { age: 41, division };
        writeState(BQ_PROFILE, value);
        expect(readState(BQ_PROFILE)).toEqual(value);
      }
    });

    it("BQ_PROFILE rejects an age the standards table has no band for", () => {
      // Under 18 there is no B.A.A. standard at all, so a stored 12 is either
      // corruption or a value from a version that allowed it. Either way the
      // form should start empty rather than render a verdict against nothing.
      window.localStorage.setItem(
        BQ_PROFILE.key,
        JSON.stringify({ age: 12, division: "men" }),
      );
      expect(readState(BQ_PROFILE)).toBeNull();
    });

    it("BQ_PROFILE rejects a non-integer age and an unknown division", () => {
      const bad = [
        { age: 41.5, division: "men" },
        { age: "41", division: "men" },
        { age: 41, division: "male" },
        { age: 41 },
        { division: "men" },
      ];
      for (const value of bad) {
        window.localStorage.setItem(BQ_PROFILE.key, JSON.stringify(value));
        expect(readState(BQ_PROFILE), JSON.stringify(value)).toBeNull();
      }
    });
  });
});
