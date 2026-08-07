-- One denormalized view serving all three read patterns:
--   map      -> group by city_name / latitude / longitude
--   calendar -> filter country_code + region_code, order by race_date
--   picker   -> next upcoming edition per series
--
-- No PostGIS: a few hundred pins is a trivial scan of a tiny table, and plain
-- numerics are enough. Revisit only if "marathons within N km of me" is wanted.
CREATE VIEW "event_calendar" AS
SELECT
  ee."id"                 AS "edition_id",
  ee."slug"               AS "edition_slug",
  ee."year"               AS "year",
  ee."race_date"          AS "race_date",
  ee."start_time_local"   AS "start_time_local",
  ee."date_confidence"    AS "date_confidence",
  ee."status"             AS "status",
  ee."registration_url"   AS "registration_url",
  es."id"                 AS "series_id",
  es."slug"               AS "series_slug",
  es."name"               AS "series_name",
  es."is_major"           AS "is_major",
  es."distance_m"         AS "distance_m",
  es."website_url"        AS "website_url",
  c."id"                  AS "city_id",
  c."slug"                AS "city_slug",
  c."name"                AS "city_name",
  c."country_code"        AS "country_code",
  c."country_name"        AS "country_name",
  c."region_code"         AS "region_code",
  c."region_name"         AS "region_name",
  c."latitude"            AS "latitude",
  c."longitude"           AS "longitude",
  c."timezone"            AS "timezone",
  co."slug"               AS "course_slug",
  co."start_lat"          AS "start_lat",
  co."start_lon"          AS "start_lon"
FROM "event_edition" ee
JOIN "event_series" es ON es."id" = ee."series_id"
JOIN "city" c ON c."id" = es."city_id"
LEFT JOIN "course" co ON co."id" = ee."course_id";
