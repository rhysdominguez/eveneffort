import { describe, it, expect, beforeEach } from "vitest";
import { useEffect } from "react";
import { act, render } from "@testing-library/react";
import { useStoredState } from "@/hooks/useStoredState";
import { defineKey, isRecord, writeState } from "@/lib/clientState";
import { clearStoredState } from "@/test/storage";

interface Note {
  text: string;
}

const NOTE = defineKey<Note>("test.note", "session", (raw) =>
  isRecord(raw) && typeof raw.text === "string" ? { text: raw.text } : null,
);

// Counted in an effect rather than during render: a render-phase write to an
// outer binding is exactly the impurity the React lint rules exist to catch,
// and commits are the right unit anyway — a runaway getSnapshot shows up as an
// unbounded commit count.
const stats = { commits: 0 };

function Probe({ fallback = "default" }: { fallback?: string }) {
  const [stored, store] = useStoredState(NOTE);
  useEffect(() => {
    stats.commits += 1;
  });
  const value = stored ?? { text: fallback };
  return (
    <button onClick={() => store({ text: "typed" })}>{value.text}</button>
  );
}

describe("useStoredState", () => {
  beforeEach(() => {
    clearStoredState();
    stats.commits = 0;
  });

  it("reports null when nothing is stored, so callers use their own default", () => {
    const { getByRole } = render(<Probe />);
    expect(getByRole("button").textContent).toBe("default");
  });

  it("reports a stored value on the first paint", () => {
    writeState(NOTE, { text: "remembered" });
    const { getByRole } = render(<Probe />);
    expect(getByRole("button").textContent).toBe("remembered");
  });

  it("persists what the setter is given", () => {
    const { getByRole } = render(<Probe />);
    act(() => getByRole("button").click());
    expect(getByRole("button").textContent).toBe("typed");
    expect(JSON.parse(window.sessionStorage.getItem(NOTE.key)!)).toEqual({
      text: "typed",
    });
  });

  it("ignores a stored value that no longer validates", () => {
    window.sessionStorage.setItem(NOTE.key, JSON.stringify({ body: "wrong" }));
    const { getByRole } = render(<Probe />);
    expect(getByRole("button").textContent).toBe("default");
  });

  it("ignores corrupt JSON", () => {
    window.sessionStorage.setItem(NOTE.key, "{{{");
    const { getByRole } = render(<Probe />);
    expect(getByRole("button").textContent).toBe("default");
  });

  it("settles rather than re-rendering forever", () => {
    // The failure this guards is specific: useSyncExternalStore loops without
    // bound if getSnapshot returns a fresh object each call, and JSON.parse
    // does exactly that unless the result is memoized against its raw string.
    writeState(NOTE, { text: "remembered" });
    render(<Probe />);
    expect(stats.commits).toBeLessThan(5);
  });

  it("notifies every mounted reader of the same key", () => {
    const { getAllByRole } = render(
      <>
        <Probe />
        <Probe fallback="other" />
      </>,
    );
    act(() => getAllByRole("button")[0].click());
    expect(getAllByRole("button").map((b) => b.textContent)).toEqual([
      "typed",
      "typed",
    ]);
  });
});
