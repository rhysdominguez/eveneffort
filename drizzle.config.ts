import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations are one-off admin DDL, not the many-short-request runtime
    // path pooling exists for — run them on the direct connection to avoid
    // pgbouncer transaction-mode quirks. src/db/client.ts (the app's runtime
    // reads) intentionally keeps using the pooled DATABASE_URL.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;
