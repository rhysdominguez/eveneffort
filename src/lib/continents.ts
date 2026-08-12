// ISO 3166-1 alpha-2 country code -> continent, the coarse cut the race
// calendar's location filter opens on.
//
// A static table rather than a dependency: it is pure data that changes on the
// timescale of countries being founded, and Rule 5 asks for a real reason
// before a library joins the stack. Membership is the UN geoscheme with the
// Americas split at the Panama/Colombia border, which is how a runner reads a
// race list — Mexico and the Caribbean sit with the US, not with Brazil.
//
// Codes the table doesn't know return null and are grouped under "Elsewhere"
// in the filter, so a newly imported country is always still reachable. Only
// Antarctica is deliberately absent.

export type ContinentCode = "AF" | "AS" | "EU" | "NA" | "OC" | "SA";

/** Display order for the filter: alphabetical by name, as the labels read. */
export const CONTINENT_CODES: ContinentCode[] = [
  "AF",
  "AS",
  "EU",
  "NA",
  "OC",
  "SA",
];

export const CONTINENT_NAMES: Record<ContinentCode, string> = {
  AF: "Africa",
  AS: "Asia",
  EU: "Europe",
  NA: "North America",
  OC: "Oceania",
  SA: "South America",
};

const MEMBERS: Record<ContinentCode, string> = {
  AF: "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW",
  AS: "AE AF AM AZ BD BH BN BT CC CN CX CY GE HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE",
  EU: "AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK",
  NA: "AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI",
  OC: "AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS",
  SA: "AR BO BR CL CO EC FK GF GY PE PY SR UY VE",
};

const BY_COUNTRY: Map<string, ContinentCode> = new Map(
  CONTINENT_CODES.flatMap((continent) =>
    MEMBERS[continent]
      .split(" ")
      // Two codes are both a country and a continent key — "AS" (American
      // Samoa / Asia) and "NA" (Namibia / North America). Lookup is keyed by
      // the country strings inside each block, never by the block's own key,
      // so American Samoa lands in Oceania and Namibia in Africa as they must.
      .map((country): [string, ContinentCode] => [country, continent]),
  ),
);

/** The continent a country sits on, or null for a code the table lacks. */
export function continentOf(countryCode: string): ContinentCode | null {
  return BY_COUNTRY.get(countryCode.toUpperCase()) ?? null;
}

/** Label for a continent code, including the null "don't know" bucket. */
export function continentLabel(continent: ContinentCode | null): string {
  return continent ? CONTINENT_NAMES[continent] : "Elsewhere";
}
