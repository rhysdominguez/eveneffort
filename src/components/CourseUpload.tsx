"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { buildResultsHref } from "@/lib/resultsParams";
import {
  ACCEPTED_EXTENSIONS,
  COURSE_NAME_MAX,
  MAX_UPLOAD_BYTES,
  nameFromFilename,
} from "@/lib/course/uploadRules";

// The upload form. Deliberately its own page rather than a branch inside the
// hero form: that form is core setup plus Calculate, and this needs a file
// picker, its own explanation and somewhere to put a parser's rejection.
//
// On success it hands off to the ordinary /results URL with the defaults the
// hero form builds, so from that point on an uploaded course is just a course.
//
// No drag-and-drop library (Rule 5) — the drop zone is the native events, and
// the input underneath it is what actually carries the file, so keyboard and
// screen-reader users get the real control rather than a div pretending.

/** Same defaults the hero form starts from: a 4-hour marathon in km. */
const DEFAULT_GOAL_SECONDS = 4 * 3600;

interface UploadResponse {
  courseId: string;
  name: string;
  elevationSource: string;
  distanceKm: number;
  expiresAt: string;
  warnings: string[];
}

export function CourseUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The name field is a suggestion the runner can overwrite, so it is only
  // auto-filled while they have not typed their own.
  const [nameTouched, setNameTouched] = useState(false);

  function chooseFile(next: File | null) {
    setFile(next);
    setError(null);
    if (next && !nameTouched) setName(nameFromFilename(next.name));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || busy) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ` +
          `${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      );
      return;
    }

    setBusy(true);
    setError(null);

    const body = new FormData();
    body.set("file", file);
    body.set("name", name);
    // There is no coordinate-to-timezone data in this app, and the runner's own
    // zone is the best available guess for a race they are uploading.
    body.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");

    try {
      const res = await fetch("/api/courses/upload", { method: "POST", body });
      const data = (await res.json()) as UploadResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That course could not be read.");
        setBusy(false);
        return;
      }
      // Leave `busy` set — the navigation is the next thing that happens, and
      // re-enabling the button first invites a second upload of the same file.
      router.push(
        buildResultsHref({
          courseId: data.courseId,
          unit: "km",
          goalTimeSeconds: DEFAULT_GOAL_SECONDS,
        }),
      );
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <div className="space-y-2">
        <label
          htmlFor="course-file"
          className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
        >
          Course file
        </label>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            chooseFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
            dragging
              ? "border-[var(--color-border-focus)] bg-[var(--color-bg-elevated)]"
              : "border-[var(--color-border)]"
          }`}
        >
          <input
            ref={inputRef}
            id="course-file"
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <p className="text-sm text-[var(--color-text-secondary)]">
            {file ? file.name : "Drop a GPX, KML, KMZ or GeoJSON file here"}
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-focus)]"
          >
            {file ? "Choose a different file" : "Choose a file"}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="course-name"
          className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
        >
          Course name
        </label>
        <input
          id="course-name"
          type="text"
          value={name}
          maxLength={COURSE_NAME_MAX}
          placeholder="My marathon"
          onChange={(e) => {
            setNameTouched(true);
            setName(e.target.value);
          }}
          className="w-full rounded-lg border border-[var(--color-border)] px-3 py-3 transition-colors focus:border-[var(--color-border-focus)] focus:outline-none"
        />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          This is what gets printed on your paceband. Up to {COURSE_NAME_MAX}{" "}
          characters.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--color-red-primary)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!file || busy}
        className="w-full rounded-lg bg-[var(--color-red-primary)] py-4 text-base font-semibold text-white transition-colors hover:bg-[var(--color-red-deep)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-tertiary)]"
      >
        {busy ? "Reading your course…" : "Build my pacing chart"}
      </button>

      <p className="text-xs text-[var(--color-text-tertiary)]">
        Files with no elevation data are filled in from a terrain model, which
        takes a few seconds longer.
      </p>
    </form>
  );
}
