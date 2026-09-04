import { describe, it, expect } from "vitest";
import {
  buildCompareHref,
  buildCompareQuery,
  DEFAULT_COMPARE_SECONDS,
  MAX_COMPARE_SECONDS,
  parseCompareParams,
  type CompareSelection,
} from "./compareParams";

function paramsFromHref(href: string): Record<string, string> {
  const i = href.indexOf("?");
  if (i === -1) return {};
  return Object.fromEntries(new URLSearchParams(href.slice(i + 1)));
}

const selection: CompareSelection = {
  fromId: "boston",
  toId: "berlin",
  goalTimeSeconds: 12000,
  unit: "km",
};

describe("compareParams", () => {
  it("roundtrips build -> parse losslessly", () => {
    expect(parseCompareParams(paramsFromHref(buildCompareHref(selection)))).toEqual(
      selection,
    );
  });

  it("roundtrips in mile mode too", () => {
    const miles: CompareSelection = { ...selection, unit: "miles" };
    expect(parseCompareParams(paramsFromHref(buildCompareHref(miles)))).toEqual(
      miles,
    );
  });

  it("omits the unit when it is km, and the whole query when nothing is picked", () => {
    // The bare /compare is the canonical URL in the sitemap, so an untouched
    // page must not rewrite the address bar into a near-duplicate of it.
    expect(buildCompareQuery(selection)).toBe("from=boston&to=berlin&t=12000");
    expect(
      buildCompareQuery({ fromId: "", toId: "", goalTimeSeconds: 12000, unit: "km" }),
    ).toBe("");
    expect(
      buildCompareHref({ fromId: "", toId: "", goalTimeSeconds: 12000, unit: "km" }),
    ).toBe("/compare");
  });

  it("emits one course when only one is picked", () => {
    expect(
      buildCompareQuery({ ...selection, toId: "" }),
    ).toBe("from=boston&t=12000");
  });

  // The divergence from resultsParams that this module exists to make: /results
  // cannot render without a course and answers { ok: false }; /compare renders
  // two empty pickers, which is its legitimate resting state.
  it("returns a usable page state from an empty query rather than an error", () => {
    expect(parseCompareParams({})).toEqual({
      fromId: "",
      toId: "",
      goalTimeSeconds: DEFAULT_COMPARE_SECONDS,
      unit: "km",
    });
  });

  it("accepts a well-formed slug it has never heard of", () => {
    // Same reasoning as resultsParams: existence is proven by the catalog
    // lookup downstream, not by this pure, synchronous parser.
    const r = parseCompareParams({ from: "atlantis-marathon", t: "12000" });
    expect(r.fromId).toBe("atlantis-marathon");
  });

  it("drops a malformed slug instead of rejecting the page", () => {
    for (const from of [
      "",
      "Berlin", // uppercase
      "-berlin", // leading hyphen
      "berlin marathon", // whitespace
      "berlin/../etc", // path traversal
      "b".repeat(65), // over the length cap
    ]) {
      const r = parseCompareParams({ from, to: "berlin", t: "12000" });
      expect(r.fromId, `from: ${JSON.stringify(from)}`).toBe("");
      // The rest of the link still works — the runner gets one picker filled.
      expect(r.toId).toBe("berlin");
      expect(r.goalTimeSeconds).toBe(12000);
    }
  });

  it("falls back to the default time on junk, zero, negative or absurd input", () => {
    for (const t of [
      undefined,
      "",
      "abc",
      "0",
      "-600",
      "NaN",
      String(MAX_COMPARE_SECONDS + 1),
    ]) {
      expect(
        parseCompareParams({ from: "boston", t }).goalTimeSeconds,
        `t: ${JSON.stringify(t)}`,
      ).toBe(DEFAULT_COMPARE_SECONDS);
    }
  });

  it("keeps a time exactly at the upper bound", () => {
    expect(
      parseCompareParams({ t: String(MAX_COMPARE_SECONDS) }).goalTimeSeconds,
    ).toBe(MAX_COMPARE_SECONDS);
  });

  it("treats an unknown unit as km rather than failing", () => {
    expect(parseCompareParams({ unit: "leagues" }).unit).toBe("km");
  });

  it("takes the first value when a param is repeated", () => {
    const r = parseCompareParams({ from: ["boston", "berlin"], t: ["12000"] });
    expect(r.fromId).toBe("boston");
    expect(r.goalTimeSeconds).toBe(12000);
  });
});
