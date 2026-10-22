// Guard for the theme discipline (CLAUDE.md Rule 2, DESIGN.md § Theme).
//
// The dark theme lives entirely at the token layer: a second set of values for
// the same variables, in globals.css. A component never branches on the theme,
// which is what keeps "restyle dark mode" a one-file change and stops a `dark:`
// utility from becoming a second source of truth that the token tests cannot
// see. The em-dash test keeps Rule 11 the same way: prose does not hold a line
// that a scan does.
//
// Tailwind's `dark:` variant is the obvious way to break it, so it is the thing
// scanned for. `prefers-color-scheme` is the other: it would make the site
// change colour for a visitor who never pressed the toggle.
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = resolve(__dirname);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, acc);
      continue;
    }
    if (!/\.(tsx?|css)$/.test(entry.name)) continue;
    // Tests state the rule in prose and in fixtures; this file is one.
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    acc.push(full);
  }
  return acc;
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const offenders = (pattern: RegExp) =>
  sourceFiles(SRC).flatMap((file) => {
    const hits = stripComments(readFileSync(file, "utf8")).match(pattern);
    return hits ? [`${relative(SRC, file)}: ${hits[0]}`] : [];
  });

describe("theme discipline", () => {
  it("has no `dark:` utility anywhere in the source", () => {
    // A letter, `[` or `!` must follow the colon, so prose like "`dark:`" and an
    // object key like `{ dark: 1 }` are not mistaken for a utility.
    expect(offenders(/(?:^|[\s"'`])dark:[\w[!-]/m)).toEqual([]);
  });

  it("never reads the system colour-scheme preference", () => {
    expect(offenders(/prefers-color-scheme|matchMedia\(\s*["'`]\(prefers/)).toEqual(
      [],
    );
  });

  it("keeps the precipitation blue to the one glyph it was opened for", () => {
    // Rule 2's third and last palette exception. --color-blue-primary exists so
    // the weather timeline's rain reads as rain; it is NOT a general accent, and
    // the way an exception like this stops being closed is one more component
    // reaching for it because it is already in globals.css. Green went through
    // the same fencing for the same reason.
    //
    // globals.css is where it is declared, so it is the one other legal mention.
    const users = offenders(/--color-blue-primary/).filter(
      (hit) => !hit.startsWith("app/globals.css:"),
    );
    expect(users).toEqual(["components/WeatherTimeline.tsx: --color-blue-primary"]);
  });
});
