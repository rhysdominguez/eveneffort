import { describe, it, expect, beforeEach } from "vitest";
import { readState, writeState } from "@/lib/clientState";
import {
  DISPLAY_UNITS,
  HOME_CALENDAR,
  HOME_FORM,
  HOME_MAP_CAMERA,
  WEATHER_MODE,
  reviveGoalTime,
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

    it("WEATHER_MODE accepts the three modes and nothing else", () => {
      for (const mode of ["forecast", "manual", "off"] as const) {
        writeState(WEATHER_MODE, mode);
        expect(readState(WEATHER_MODE)).toBe(mode);
      }
      window.sessionStorage.setItem(WEATHER_MODE.key, JSON.stringify("auto"));
      expect(readState(WEATHER_MODE)).toBeNull();
    });
  });
});
