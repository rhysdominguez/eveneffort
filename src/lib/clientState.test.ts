import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  clearState,
  defineKey,
  getStateSnapshot,
  isIntegerInRange,
  isNumberInRange,
  isOneOf,
  isRecord,
  nullableOf,
  readState,
  setStoredState,
  subscribeState,
  writeState,
} from "@/lib/clientState";
import { clearStoredState } from "@/test/storage";

interface Point {
  x: number;
  y: number;
}

const revivePoint = (raw: unknown): Point | null => {
  if (!isRecord(raw)) return null;
  if (typeof raw.x !== "number" || typeof raw.y !== "number") return null;
  return { x: raw.x, y: raw.y };
};

const SESSION_KEY = defineKey<Point>("test.point", "session", revivePoint);
const LOCAL_KEY = defineKey<Point>("test.point", "local", revivePoint);

describe("clientState", () => {
  beforeEach(clearStoredState);
  afterEach(() => vi.restoreAllMocks());

  it("round-trips a value", () => {
    writeState(SESSION_KEY, { x: 1, y: 2 });
    expect(readState(SESSION_KEY)).toEqual({ x: 1, y: 2 });
  });

  it("namespaces its keys so nothing collides with other app storage", () => {
    writeState(SESSION_KEY, { x: 1, y: 2 });
    expect(SESSION_KEY.key).toBe("ee:v1:test.point");
    expect(window.sessionStorage.getItem("test.point")).toBeNull();
  });

  it("routes each scope to its own store", () => {
    writeState(SESSION_KEY, { x: 1, y: 2 });
    // Same name, different scope: the two must not see each other, or a
    // session value would outlive the tab it was written in.
    expect(readState(LOCAL_KEY)).toBeNull();

    writeState(LOCAL_KEY, { x: 9, y: 9 });
    expect(readState(SESSION_KEY)).toEqual({ x: 1, y: 2 });
    expect(readState(LOCAL_KEY)).toEqual({ x: 9, y: 9 });
  });

  it("reports null for a key that was never written", () => {
    expect(readState(SESSION_KEY)).toBeNull();
  });

  it("discards corrupt JSON, and clears it so it can't fail twice", () => {
    window.sessionStorage.setItem(SESSION_KEY.key, "{not json");
    expect(readState(SESSION_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(SESSION_KEY.key)).toBeNull();
  });

  it("discards a value whose shape no longer matches", () => {
    // The shape a previous deploy wrote. Valid JSON, wrong contents.
    window.sessionStorage.setItem(
      SESSION_KEY.key,
      JSON.stringify({ lat: 1, lon: 2 }),
    );
    expect(readState(SESSION_KEY)).toBeNull();
  });

  it("swallows a storage write that throws", () => {
    // Safari in private mode, once the quota is reached.
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => writeState(SESSION_KEY, { x: 1, y: 2 })).not.toThrow();
  });

  it("swallows a storage read that throws", () => {
    vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    expect(readState(SESSION_KEY)).toBeNull();
  });

  it("clears a value", () => {
    writeState(SESSION_KEY, { x: 1, y: 2 });
    clearState(SESSION_KEY);
    expect(readState(SESSION_KEY)).toBeNull();
  });

  describe("snapshots", () => {
    it("returns a stable reference while the stored string is unchanged", () => {
      writeState(SESSION_KEY, { x: 1, y: 2 });
      const first = getStateSnapshot(SESSION_KEY);
      const second = getStateSnapshot(SESSION_KEY);
      // Referential equality, not deep equality: useSyncExternalStore re-renders
      // forever if getSnapshot hands back a fresh object each call.
      expect(first).toBe(second);
    });

    it("returns a new reference once the value actually changes", () => {
      writeState(SESSION_KEY, { x: 1, y: 2 });
      const first = getStateSnapshot(SESSION_KEY);
      setStoredState(SESSION_KEY, { x: 3, y: 4 });
      const second = getStateSnapshot(SESSION_KEY);
      expect(second).not.toBe(first);
      expect(second).toEqual({ x: 3, y: 4 });
    });

    it("notifies subscribers on write, and stops after unsubscribe", () => {
      const seen = vi.fn();
      const unsubscribe = subscribeState(SESSION_KEY, seen);
      setStoredState(SESSION_KEY, { x: 1, y: 2 });
      expect(seen).toHaveBeenCalledTimes(1);

      unsubscribe();
      setStoredState(SESSION_KEY, { x: 3, y: 4 });
      expect(seen).toHaveBeenCalledTimes(1);
    });

    it("does not notify a subscriber on a different key", () => {
      const other = defineKey<Point>("test.other", "session", revivePoint);
      const seen = vi.fn();
      const unsubscribe = subscribeState(other, seen);
      setStoredState(SESSION_KEY, { x: 1, y: 2 });
      expect(seen).not.toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe("revive helpers", () => {
    it("isRecord rejects arrays and null", () => {
      expect(isRecord({ a: 1 })).toBe(true);
      expect(isRecord([1, 2])).toBe(false);
      expect(isRecord(null)).toBe(false);
      expect(isRecord("x")).toBe(false);
    });

    it("isNumberInRange rejects NaN, Infinity and out-of-range", () => {
      expect(isNumberInRange(5, 0, 10)).toBe(true);
      expect(isNumberInRange(0, 0, 10)).toBe(true);
      expect(isNumberInRange(11, 0, 10)).toBe(false);
      expect(isNumberInRange(Number.NaN, 0, 10)).toBe(false);
      expect(isNumberInRange(Number.POSITIVE_INFINITY, 0, 10)).toBe(false);
      expect(isNumberInRange("5", 0, 10)).toBe(false);
    });

    it("isIntegerInRange rejects fractions", () => {
      expect(isIntegerInRange(3, 1, 12)).toBe(true);
      expect(isIntegerInRange(3.5, 1, 12)).toBe(false);
      expect(isIntegerInRange(13, 1, 12)).toBe(false);
    });

    it("isOneOf accepts only members of the closed set", () => {
      expect(isOneOf("km", ["km", "miles"] as const)).toBe(true);
      expect(isOneOf("furlongs", ["km", "miles"] as const)).toBe(false);
      expect(isOneOf(1, ["km", "miles"] as const)).toBe(false);
    });

    it("nullableOf keeps a meaningful null but rejects a wrong type", () => {
      const guard = (v: unknown): v is string => typeof v === "string";
      expect(nullableOf(null, guard)).toBeNull();
      expect(nullableOf("US", guard)).toBe("US");
      // undefined is the "reject" signal, distinct from a stored null.
      expect(nullableOf(7, guard)).toBeUndefined();
    });
  });
});
