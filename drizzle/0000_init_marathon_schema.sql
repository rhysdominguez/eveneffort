CREATE TABLE "city" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"country_name" text NOT NULL,
	"region_code" text,
	"region_name" text,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"timezone" text NOT NULL,
	CONSTRAINT "city_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "course" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"series_id" integer NOT NULL,
	"label" text,
	"effective_from_year" smallint,
	"effective_to_year" smallint,
	"distance_m" integer DEFAULT 42195 NOT NULL,
	"elevations" jsonb NOT NULL,
	"coords" jsonb NOT NULL,
	"profile" jsonb NOT NULL,
	"start_lat" numeric(9, 6) NOT NULL,
	"start_lon" numeric(9, 6) NOT NULL,
	"gpx_source_path" text,
	"checksum" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "event_edition" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"series_id" integer NOT NULL,
	"year" smallint NOT NULL,
	"race_date" date NOT NULL,
	"start_time_local" time,
	"date_confidence" text DEFAULT 'estimated' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"course_id" integer,
	"registration_opens_at" date,
	"registration_closes_at" date,
	"registration_url" text,
	CONSTRAINT "event_edition_slug_unique" UNIQUE("slug"),
	CONSTRAINT "event_edition_series_year_key" UNIQUE("series_id","year")
);
--> statement-breakpoint
CREATE TABLE "event_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city_id" integer NOT NULL,
	"distance_m" integer DEFAULT 42195 NOT NULL,
	"website_url" text,
	"organizer" text,
	"description" text,
	"is_major" boolean DEFAULT false NOT NULL,
	"typical_month" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_series_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_series_id_event_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."event_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_edition" ADD CONSTRAINT "event_edition_series_id_event_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."event_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_edition" ADD CONSTRAINT "event_edition_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_city_id_city_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "city_country_region_idx" ON "city" USING btree ("country_code","region_code");--> statement-breakpoint
CREATE INDEX "course_series_idx" ON "course" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "event_edition_race_date_idx" ON "event_edition" USING btree ("race_date");--> statement-breakpoint
CREATE INDEX "event_series_city_idx" ON "event_series" USING btree ("city_id");