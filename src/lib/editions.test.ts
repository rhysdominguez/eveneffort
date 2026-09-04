import { describe, expect, it } from "vitest";
import type { EditionOption } from "@/types";
import {
  ASSUMED_START_TIME,
  defaultStartTime,
  editionForDate,
  editionForYear,
  isPastISO,
  nextEdition,
  resolveRaceDate,
  startTimeIsAssumed,
  weatherSourceFor,
} from "@/lib/editions";

const TODAY = "2026-08-19";

const ed = (
  year: number,
  raceDateISO: string,
  over: Partial<EditionOption> = {},
): EditionOption => ({
  year,
  raceDateISO,
  startTimeLocal: null,
  dateConfidence: "confirmed",
  variant: null,
  ...over,
});

// Boston: two years behind us, two ahead, as the widened SEED_YEARS produces.
const BOSTON = [
  ed(2024, "2024-04-15"),
  ed(2025, "2025-04-21"),
  ed(2026, "2026-04-20"),
  ed(2027, "2027-04-19"),
];

describe("isPastISO", () => {
  it("treats today as not past", () => {
    expect(isPastISO(TODAY, TODAY)).toBe(false);
    expect(isPastISO("2026-08-18", TODAY)).toBe(true);
    expect(isPastISO("2026-08-20", TODAY)).toBe(false);
  });
});

describe("nextEdition", () => {
  it("picks the soonest edition still to come", () => {
    expect(nextEdition(BOSTON, TODAY)?.year).toBe(2027);
  });

  it("is order-independent", () => {
    const shuffled = [BOSTON[2], BOSTON[0], BOSTON[3], BOSTON[1]];
    expect(nextEdition(shuffled, TODAY)?.year).toBe(2027);
  });

  it("falls back to the most recent running once the seed is exhausted", () => {
    // The seed horizon is finite and will eventually be overtaken. Returning
    // null there would empty the picker; the last running is the least wrong
    // thing to open on.
    expect(nextEdition(BOSTON, "2030-01-01")?.year).toBe(2027);
  });

  it("returns null only for a series with no editions", () => {
    expect(nextEdition([], TODAY)).toBeNull();
  });
});

describe("editionForYear / editionForDate", () => {
  it("finds a year", () => {
    expect(editionForYear(BOSTON, 2026)?.raceDateISO).toBe("2026-04-20");
    expect(editionForYear(BOSTON, 2019)).toBeNull();
  });

  it("returns the earlier running when a series runs twice in one year", () => {
    // London 2027 splits elite and mass across two days — two rows, one year.
    const london = [
      ed(2027, "2027-04-25", { variant: "mass" }),
      ed(2027, "2027-04-24", { variant: "elite" }),
    ];
    expect(editionForYear(london, 2027)?.variant).toBe("elite");
  });

  it("matches an exact date", () => {
    expect(editionForDate(BOSTON, "2026-04-20")?.year).toBe(2026);
    expect(editionForDate(BOSTON, "2026-04-21")).toBeNull();
  });
});

describe("resolveRaceDate", () => {
  it("defaults to the next edition", () => {
    expect(
      resolveRaceDate({ editions: BOSTON, todayISO: TODAY }),
    ).toBe("2027-04-19");
  });

  it("keeps a PAST date that came from the URL", () => {
    // A shared /results link to a race already run must reproduce that chart —
    // pacing a past edition is a supported destination, not a mistake to fix.
    // Advancing it would change what someone else opened.
    expect(
      resolveRaceDate({
        editions: BOSTON,
        urlDate: "2026-04-20",
        todayISO: TODAY,
      }),
    ).toBe("2026-04-20");
  });

  it("keeps a custom URL date that matches no edition", () => {
    expect(
      resolveRaceDate({
        editions: BOSTON,
        urlDate: "2026-11-03",
        todayISO: TODAY,
      }),
    ).toBe("2026-11-03");
  });

  it("rolls a stale session date forward to the next edition", () => {
    // The bug this feature exists to fix: a snapshot left in session storage
    // from an earlier visit used to pace a race that had since been run.
    expect(
      resolveRaceDate({
        editions: BOSTON,
        restoredDate: "2026-04-20",
        todayISO: TODAY,
      }),
    ).toBe("2027-04-19");
  });

  it("keeps a session date that is still ahead", () => {
    expect(
      resolveRaceDate({
        editions: BOSTON,
        restoredDate: "2027-04-19",
        todayISO: TODAY,
      }),
    ).toBe("2027-04-19");
  });

  it("lets the URL win over a stored date", () => {
    expect(
      resolveRaceDate({
        editions: BOSTON,
        urlDate: "2026-04-20",
        restoredDate: "2027-04-19",
        todayISO: TODAY,
      }),
    ).toBe("2026-04-20");
  });

  it("returns empty when there is nothing to offer", () => {
    expect(resolveRaceDate({ editions: [], todayISO: TODAY })).toBe("");
  });
});

describe("start time", () => {
  it("prefers a published start time", () => {
    const e = ed(2027, "2027-04-19", { startTimeLocal: "09:00" });
    expect(defaultStartTime(e)).toBe("09:00");
    expect(startTimeIsAssumed(e, "09:00")).toBe(false);
  });

  it("assumes 7:30 local when none is published", () => {
    expect(defaultStartTime(BOSTON[3])).toBe(ASSUMED_START_TIME);
    expect(startTimeIsAssumed(BOSTON[3], ASSUMED_START_TIME)).toBe(true);
  });

  it("stops flagging an assumption once the runner sets their own time", () => {
    expect(startTimeIsAssumed(BOSTON[3], "08:15")).toBe(false);
  });

  it("assumes 7:30 for a custom date with no edition behind it", () => {
    expect(defaultStartTime(null)).toBe(ASSUMED_START_TIME);
  });
});

describe("weatherSourceFor", () => {
  it("routes a future date to the forecast path", () => {
    expect(weatherSourceFor(BOSTON[3], "2027-04-19", TODAY)).toBe("forecast");
  });

  it("routes a confirmed past date to recorded conditions", () => {
    expect(weatherSourceFor(BOSTON[2], "2026-04-20", TODAY)).toBe("historical");
  });

  it("routes an ESTIMATED past date to climatology", () => {
    // SEED_YEARS reaches back to 2022, but only the years CONFIRMED_EDITIONS
    // covers have a real date — the rest come from the recurrence rule and can
    // miss the true race day by a week. Fetching "the weather on race day" for
    // the wrong day and calling it fact is worse than admitting uncertainty.
    const guessed = ed(2023, "2023-04-17", { dateConfidence: "estimated" });
    expect(weatherSourceFor(guessed, "2023-04-17", TODAY)).toBe("typical");
  });

  it("trusts a past custom date the runner picked themselves", () => {
    expect(weatherSourceFor(null, "2026-03-01", TODAY)).toBe("historical");
  });
});
