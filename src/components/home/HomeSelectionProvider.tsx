"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The home page's one piece of shared client state: which course is selected.
 *
 * It exists because the map and the form that consumes its choice are separate
 * bands — the map is halfway down the page, the pacing form is up in the hero
 * — so the selection cannot live inside `InputForm` the way it does on the
 * dashboard.
 *
 * `children` is the whole rest of the page, passed through untouched. That is
 * load-bearing: everything below the hero stays a server component, so the
 * demo pace chart in the feature rows is still computed at build time (see the
 * note atop `src/app/page.tsx`). Wrapping the tree in a client provider does
 * NOT make its children client components.
 */
interface HomeSelection {
  /** Course chosen from the map, or null while the form's own default stands. */
  courseId: string | null;
  /** Select a course and take the runner to the form that uses it. */
  requestCourse: (courseId: string) => void;
  /** Form-driven changes, so the two stay in step once the map has spoken. */
  setCourseId: (courseId: string) => void;
}

const Context = createContext<HomeSelection | null>(null);

export function HomeSelectionProvider({ children }: { children: ReactNode }) {
  const [courseId, setCourseId] = useState<string | null>(null);

  const requestCourse = useCallback((next: string) => {
    setCourseId(next);
    // Selecting a race on the map is only half the gesture — the form that
    // acts on it is above the fold, so bring it into view.
    const target = document.getElementById("calculator");
    if (!target) return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    target.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  const value = useMemo(
    () => ({ courseId, requestCourse, setCourseId }),
    [courseId, requestCourse],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Null outside the provider — which is a legitimate state, not an error: the
 * dashboard renders `InputForm` with no map anywhere on the page.
 */
export function useHomeSelection(): HomeSelection | null {
  return useContext(Context);
}
