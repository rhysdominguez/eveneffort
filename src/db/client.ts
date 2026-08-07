// Neon serverless Postgres client.
//
// Uses the HTTP driver rather than a TCP pool: Vercel functions are short-lived
// and would otherwise exhaust connection slots. Each query is one stateless
// fetch, so there is nothing to pool and nothing to clean up.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
// Explicit .ts extension: scripts/seed.ts runs this under Node's native
// type-stripping, which requires it (the Next.js bundler resolves either way).
import * as schema from "./schema.ts";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.",
    );
  }
  return url;
}

/**
 * Lazily constructed so that importing this module never throws. `npm run
 * build` and the test suite both run without a database reachable, and the
 * course queries are the only things that actually need one.
 */
let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!cached) {
    cached = drizzle(neon(connectionString()), { schema });
  }
  return cached;
}

/** True when a connection string is configured. Lets callers degrade gracefully. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
