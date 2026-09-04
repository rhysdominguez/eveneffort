CREATE TABLE "user_course" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"name" text NOT NULL,
	"elevations" jsonb NOT NULL,
	"coords" jsonb NOT NULL,
	"profile" jsonb NOT NULL,
	"start_lat" numeric(9, 6) NOT NULL,
	"start_lon" numeric(9, 6) NOT NULL,
	"timezone" text NOT NULL,
	"elevation_source" text NOT NULL,
	"distance_m" integer NOT NULL,
	"creator_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "user_course_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "user_course_creator_idx" ON "user_course" USING btree ("creator_hash","created_at");--> statement-breakpoint
CREATE INDEX "user_course_expires_idx" ON "user_course" USING btree ("expires_at");