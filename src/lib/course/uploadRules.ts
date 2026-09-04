// The rules an uploaded course file has to satisfy, kept pure and out of the
// route so they can be unit tested without a Request, a database or a network.
import { createHash } from "node:crypto";

/**
 * Byte ceiling for one upload. A 4,000-point GPX — denser than anything in the
 * seeded catalog — is around 400 KB, so this is roughly 5x headroom and still
 * small enough that a bad actor cannot use the route as storage.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Cap on the course name.
 *
 * Not cosmetic. This string is printed on a paceband 1.3 inches wide at 7pt
 * (see the @media print block in globals.css — roughly 24 characters a line),
 * and it is written into the Stripe metadata that is the entire order-intake
 * record a human reads to fulfil the band. 40 wraps to two lines at worst.
 */
export const COURSE_NAME_MAX = 40;

export const ACCEPTED_EXTENSIONS = [".gpx", ".kml", ".kmz", ".json", ".geojson"];

/**
 * Control characters and the Unicode bidi overrides.
 *
 * The bidi ones matter as much as the C0 range: U+202E and friends reorder the
 * text around them, so a name can render as something other than what is
 * stored — on a printed band, and in the order record a person reads. Stripped
 * rather than rejected, so a stray character costs nobody their upload.
 *
 * Built with new RegExp from escape sequences rather than a literal, so this
 * source file itself contains no control characters.
 */
const UNSAFE_NAME_CHARS = new RegExp(
  "[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069]",
  "g",
);

/**
 * Clean a runner-supplied course name into something safe to print and to put
 * in front of a fulfilment operator. Returns "" when nothing usable is left,
 * which the caller treats as "fall back to the file's own name".
 */
export function sanitizeCourseName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(UNSAFE_NAME_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, COURSE_NAME_MAX)
    .trim();
}

/** Derive a fallback name from the uploaded filename. */
export function nameFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  return sanitizeCourseName(stem);
}

export function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * A stable, irreversible per-client key for rate limiting.
 *
 * Salted with an env secret so the hashes are not a rainbow table of the IPv4
 * space — an unsalted SHA-256 of an IP address is trivially reversible, which
 * would turn this into a log of who uploaded what. With no salt configured it
 * still works; it is just weaker, and that beats disabling the rate limit.
 */
export function clientHash(forwardedFor: string | null): string | null {
  const ip = forwardedFor?.split(",")[0]?.trim();
  if (!ip) return null;
  return createHash("sha256")
    .update(`${process.env.UPLOAD_HASH_SALT ?? "eveneffort"}:${ip}`)
    .digest("hex");
}
