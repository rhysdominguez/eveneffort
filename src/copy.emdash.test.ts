// Guard for Rule 11: no em dashes in text the site renders.
//
// The rule is about published copy, not about how we talk to each other in the
// source, so this scans only the parts of a file that can reach a visitor:
// string and template literals, and JSX text. Comments are stripped first and
// never checked — an em dash in a code comment is fine and there are hundreds
// of them.
//
// Test files are skipped wholesale (describe/it titles are not copy), as is
// src/db/seed/, whose `note` fields are operator annotations that exist only in
// the seed source: they are not in the schema, not in queries, not in the
// types, and never rendered.
import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = resolve(__dirname);
const EM_DASH = "\u2014";

// Every spelling of the same character. `&mdash;` is the one that hid from the
// first sweep of this rule: a literal-character grep walked straight past it
// while the page still rendered an em dash.
const SPELLINGS = [EM_DASH, "&mdash;", "&#8212;", "&#x2014;", "\\u2014"];
const ANY_SPELLING = new RegExp(SPELLINGS.map((s) => s.replace(/[\\&#;]/g, "\\$&")).join("|"), "i");

// The one sanctioned use: a lone em dash standing in for a value that does not
// exist. It is a typographic mark in a table cell or an input placeholder, not
// prose, so it cannot read as writing of any kind. Keyed by file so a new one
// has to be added here deliberately.
const PLACEHOLDER_GLYPH_ALLOWED = new Set([
  "lib/units/time.ts",
  "components/PaceChartTable.tsx",
  "components/BostonQualifier.tsx",
  // The Altitude column: most of the catalog is below the penalty threshold,
  // and the empty cell takes the same placeholder glyph as the tables above.
  "components/CourseRankingTable.tsx",
]);

const SKIP_DIRS = new Set(["db/seed", "test"]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    const rel = relative(SRC, full);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(rel)) sourceFiles(full, acc);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.(test|spec|fixture)\.tsx?$/.test(entry.name)) continue;
    acc.push(full);
  }
  return acc;
}

/**
 * Blank out every comment, leaving the file's length and line breaks intact so
 * a hit still reports the line it is on. Tracks string, template and regex
 * literals so a `//` inside one is not mistaken for the start of a comment.
 */
function blankComments(src: string): string {
  const out = src.split("");
  let i = 0;
  let quote: string | null = null;

  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k += 1) if (out[k] !== "\n") out[k] = " ";
  };

  // What can precede a `/` that opens a regex literal rather than dividing.
  // Without this, the `'` inside `.replace(/'/g, …)` opens a phantom string and
  // every comment after it is scanned as code.
  const REGEX_POSITION = /[([{,;:=!&|?+\-*%~^<>]$|\breturn$/;
  let lastCode = "";

  while (i < src.length) {
    const c = src[i];

    if (quote) {
      if (c === "\\") {
        i += 2;
      } else {
        if (c === quote) quote = null;
        i += 1;
      }
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      i += 1;
    } else if (
      c === "/" &&
      src[i + 1] !== "/" &&
      src[i + 1] !== "*" &&
      REGEX_POSITION.test(lastCode)
    ) {
      // Skip the whole regex literal, escapes and character classes included.
      i += 1;
      let inClass = false;
      while (i < src.length && src[i] !== "\n") {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) {
          i += 1;
          break;
        }
        i += 1;
      }
    } else if (c === "/" && src[i + 1] === "/") {
      const end = src.indexOf("\n", i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else {
      i += 1;
    }

    if (!quote && !/\s/.test(c)) lastCode = (lastCode + c).slice(-6);
  }

  return out.join("");
}

/** A line whose only em dash content is the standalone placeholder glyph. */
function isPlaceholderOnly(line: string): boolean {
  const normalised = line.replace(new RegExp(ANY_SPELLING, "gi"), EM_DASH);
  return !new RegExp(`[^\\s"'>{(,]\\s*${EM_DASH}|${EM_DASH}\\s*[^\\s"'<}),]`).test(normalised);
}

describe("rendered copy carries no em dashes (Rule 11)", () => {
  const files = sourceFiles(SRC);

  it("scans a meaningful number of source files", () => {
    // Cheap canary: if the walker or the filters break, the suite must not go
    // quietly green on an empty file list.
    expect(files.length).toBeGreaterThan(50);
  });

  it("finds no em dash outside comments", () => {
    const hits: string[] = [];

    for (const file of files) {
      const rel = relative(SRC, file);
      const code = blankComments(readFileSync(file, "utf8"));

      code.split("\n").forEach((line, idx) => {
        if (!ANY_SPELLING.test(line)) return;
        if (PLACEHOLDER_GLYPH_ALLOWED.has(rel) && isPlaceholderOnly(line)) return;
        hits.push(`src/${rel}:${idx + 1}: ${line.trim()}`);
      });
    }

    expect(
      hits,
      `Em dashes in rendered copy. Rewrite the sentence so it says the same ` +
        `thing without one (CLAUDE.md Rule 11):\n${hits.join("\n")}`,
    ).toEqual([]);
  });
});
