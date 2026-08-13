// Browser-storage primitive for state that has to survive leaving a page and
// coming back — calendar filters, the map camera, the hero form, display units.
//
// Two rules the whole design follows, both learned from what this app is:
//
// 1. NOTHING here may be called during render. The home page is statically
//    prerendered, so a render-time storage read is a hydration mismatch. Every
//    caller initialises from the same default the server rendered, then
//    restores in a layout effect. `usePersistentState` enforces the pattern.
//
// 2. NOTHING that comes out of storage is trusted. A snapshot written by a
//    previous deploy, or a filter naming a country a later import batch
//    dropped, must be discarded rather than fed to a component that assumes a
//    shape. Every key carries a `revive` that has to hand back a valid value or
//    null — there is no cast-and-hope path.
//
// Storage itself is best-effort. Safari in private mode throws on setItem once
// its quota is reached, and reading storage at all throws in a sandboxed
// iframe. Both degrade to "no persistence"; neither is allowed to surface as an
// error in a UI whose actual job is pacing charts.

/**
 * `session` clears when the tab closes — browsing state, which should not
 * greet someone weeks later. `local` persists — preferences about the runner
 * rather than about this visit.
 */
export type Scope = "session" | "local";

/**
 * Bumping the version orphans every previously stored value at once, which is
 * the escape hatch for a shape change too big to express in a revive function.
 * Old entries are left behind rather than migrated; sessionStorage empties
 * itself and localStorage holds a few hundred stale bytes.
 */
const PREFIX = "ee:v1:";

export interface StateKey<T> {
  /** Storage key, already namespaced. */
  readonly key: string;
  readonly scope: Scope;
  /** Parsed JSON in, a valid T or null out. Never throws. */
  readonly revive: (raw: unknown) => T | null;
}

export function defineKey<T>(
  name: string,
  scope: Scope,
  revive: (raw: unknown) => T | null,
): StateKey<T> {
  return { key: `${PREFIX}${name}`, scope, revive };
}

/**
 * The backing store, or null when there isn't one — during SSR, and in
 * embedding contexts where merely touching `window.sessionStorage` throws.
 */
function storeFor(scope: Scope): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return scope === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/** The stored value, or null if absent, unparseable, or no longer valid. */
export function readState<T>(key: StateKey<T>): T | null {
  const store = storeFor(key.scope);
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(key.key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return key.revive(JSON.parse(raw));
  } catch {
    // Corrupt JSON, or a revive that threw on a shape it didn't expect. Drop
    // the entry so the next visit starts clean instead of failing again.
    clearState(key);
    return null;
  }
}

export function writeState<T>(key: StateKey<T>, value: T): void {
  const store = storeFor(key.scope);
  if (!store) return;
  try {
    store.setItem(key.key, JSON.stringify(value));
  } catch {
    // Quota exceeded, or storage disabled. Persistence is an enhancement here;
    // losing it costs the runner a restored filter, not their pacing chart.
  }
}

export function clearState<T>(key: StateKey<T>): void {
  const store = storeFor(key.scope);
  if (!store) return;
  try {
    store.removeItem(key.key);
  } catch {
    // As above.
  }
  emit(key.key);
}

// --- Subscription, for useSyncExternalStore -------------------------------
//
// Browser storage is an external store, and React has an API for exactly that.
// Going through it rather than "useState + restore in an effect" buys two
// things that matter here:
//
// - A real server snapshot. `getServerSnapshot` returns null, so the prerendered
//   HTML and the hydrating render agree by construction; React then re-renders
//   with the client value. No hydration mismatch, and no window where a
//   component has mounted showing defaults it is about to replace.
// - No ordering hazard. A layout-effect restore races any passive effect that
//   also touches the same state — which is precisely the trap the race
//   calendar's "correct the clock after hydration" effect would have fallen
//   into, quietly undoing the restored month.

const listeners = new Map<string, Set<() => void>>();

function emit(storageKey: string): void {
  for (const listener of listeners.get(storageKey) ?? []) listener();
}

/**
 * Snapshot cache. `useSyncExternalStore` re-renders in a loop unless
 * `getSnapshot` returns a stable reference for unchanged data, and JSON.parse
 * hands back a fresh object every call — so results are memoized against the
 * raw string they were parsed from.
 */
const snapshots = new Map<string, { raw: string | null; value: unknown }>();

export function subscribeState<T>(
  key: StateKey<T>,
  onChange: () => void,
): () => void {
  let set = listeners.get(key.key);
  if (!set) {
    set = new Set();
    listeners.set(key.key, set);
  }
  set.add(onChange);
  return () => {
    set.delete(onChange);
    if (set.size === 0) listeners.delete(key.key);
  };
}

/** Stable-reference read for `useSyncExternalStore`. Never throws. */
export function getStateSnapshot<T>(key: StateKey<T>): T | null {
  const store = storeFor(key.scope);
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(key.key);
  } catch {
    return null;
  }
  const cached = snapshots.get(key.key);
  if (cached && cached.raw === raw) return cached.value as T | null;

  let value: T | null = null;
  if (raw !== null) {
    try {
      value = key.revive(JSON.parse(raw));
    } catch {
      value = null;
    }
  }
  snapshots.set(key.key, { raw, value });
  return value;
}

/** Write and notify subscribers. The setter half of `useStoredState`. */
export function setStoredState<T>(key: StateKey<T>, value: T): void {
  writeState(key, value);
  emit(key.key);
}

/**
 * Cross-tab sync. `storage` fires only in OTHER tabs and only for
 * localStorage, which is exactly the display-unit preference — flip to °F in
 * one tab and a second tab holding a chart follows.
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null) {
      // The whole store was cleared.
      snapshots.clear();
      for (const storageKey of listeners.keys()) emit(storageKey);
      return;
    }
    if (!listeners.has(event.key)) return;
    snapshots.delete(event.key);
    emit(event.key);
  });
}

// --- Revive helpers -------------------------------------------------------
// Shared by the validators in stateKeys.ts. Small and boring on purpose: the
// point is that every field of every stored shape is checked by one of these.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A real number — rejects NaN, Infinity, and the strings JSON round-trips. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNumberInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

export function isIntegerInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A string drawn from a closed set — the shape every unit toggle stores. */
export function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** `T | null`, where null is a meaningful stored value rather than "absent". */
export function nullableOf<T>(
  value: unknown,
  guard: (v: unknown) => v is T,
): T | null | undefined {
  if (value === null) return null;
  return guard(value) ? value : undefined;
}
