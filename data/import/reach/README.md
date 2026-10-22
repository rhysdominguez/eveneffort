# Reach reference data

`cities.csv` is city population data used offline by `scripts/import/rank.ts`
to order the import backlog by how many runners a race plausibly reaches. It is
never rendered to a visitor and never reaches the database.

Derived from GeoNames `cities15000`, filtered to population >= 100,000 and
trimmed to five columns (name, asciiName, countryCode, admin1, population).
6,277 rows as of 2026-09-23.

City and population data from [GeoNames](https://www.geonames.org/), licensed
**CC BY 4.0**. See `docs/COURSE-RIGHTS.md` §6.

To refresh:

```
curl -sL -o /tmp/c.zip https://download.geonames.org/export/dump/cities15000.zip
unzip -p /tmp/c.zip cities15000.txt | awk -F'\t' '$15>=100000 {print}' ...
```

The trim is a one-liner over the tab-separated dump; columns are 2 (name),
3 (asciiname), 9 (country code), 11 (admin1) and 15 (population).
