CREATE TABLE "weather_window" (
	"id" serial PRIMARY KEY NOT NULL,
	"lat" numeric(9, 4) NOT NULL,
	"lon" numeric(9, 4) NOT NULL,
	"start_utc" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"hours" jsonb NOT NULL,
	"meta" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "weather_window_key" UNIQUE("lat","lon","start_utc","source")
);
--> statement-breakpoint
CREATE INDEX "weather_window_expires_idx" ON "weather_window" USING btree ("expires_at");