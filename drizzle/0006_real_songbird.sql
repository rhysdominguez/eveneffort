-- Weather timeline (ROADMAP #14): the stored window grows a pre-race hour and a
-- shape version.
--
-- `version` exists because `historical` rows never expire. Without it, a row
-- written before cloud cover and precipitation were fetched would be served
-- unchanged forever, so the timeline would be permanently blank on exactly the
-- races someone had already looked at. Rows at an older version are invisible
-- to readWindow, re-fetched once, and overwritten in place: `version` is not
-- part of the unique key, so no duplicates accumulate.
--
-- The default of 1 is what back-dates every existing row to the old shape.
ALTER TABLE "weather_window" ADD COLUMN "lead" jsonb;--> statement-breakpoint
ALTER TABLE "weather_window" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;