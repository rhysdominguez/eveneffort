import type { Metadata } from "next";
import Link from "next/link";

import { CourseUpload } from "@/components/CourseUpload";
import { DISTANCE_MAX_KM, DISTANCE_MIN_KM } from "@/lib/course/resample";
import { UPLOAD_TTL_DAYS } from "@/db/userCourses";

export const metadata: Metadata = {
  title: "Upload your own marathon course — GPX, KML or GeoJSON",
  description:
    "Build an elevation-adjusted pacing chart for any marathon course, not just the ones we hold. Upload a GPX, KML, KMZ or GeoJSON route and get the same even-effort splits, weather model and printable paceband.",
  alternates: { canonical: "/upload" },
};

// The one page in the app that takes something from the runner rather than
// giving them something. Server shell; the form is the client island.
export default function UploadPage() {
  return (
    <main className="w-full flex-1">
      <section className="mx-auto w-full max-w-2xl space-y-8 px-6 py-16">
        <header className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Bring your own course
          </p>
          <h1 className="font-display text-3xl tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
            Upload a marathon course
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">
            Running a race we don&rsquo;t hold, or your own route? Upload the
            course file and you get the same chart as any race in the catalogue
            — even-effort splits off the real gradients, the weather model, and
            a paceband you can print or order.
          </p>
        </header>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8">
          <CourseUpload />
        </div>

        <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
            What to expect
          </h2>
          <p>
            <strong className="font-medium text-[var(--color-text-primary)]">
              It has to be a marathon.
            </strong>{" "}
            The route needs to measure between {DISTANCE_MIN_KM} and{" "}
            {DISTANCE_MAX_KM} km. Anything measured from a GPS trace or drawn by
            hand runs a little long against the certified distance, which is
            normal and why the window is wider than 42.195 either side.
          </p>
          <p>
            <strong className="font-medium text-[var(--color-text-primary)]">
              Your link is the only copy.
            </strong>{" "}
            There are no accounts here, so nothing is tied to you and nothing
            can be recovered from an email address. Keep the URL. Uploaded
            courses are kept for {UPLOAD_TTL_DAYS} days; ordering a printed
            paceband keeps yours permanently, because a band has the link
            printed on it.
          </p>
          <p>
            <strong className="font-medium text-[var(--color-text-primary)]">
              Anyone with the link can see it.
            </strong>{" "}
            It is unlisted — it never appears in the course list, the map or the
            rankings — but it is not secret. Don&rsquo;t upload a route you
            wouldn&rsquo;t share.
          </p>
          <p>
            Curious how the pacing is calculated?{" "}
            <Link
              href="/methodology"
              className="underline transition-colors hover:text-[var(--color-text-primary)]"
            >
              Read the methodology
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
