/**
 * The subdivision half of an ISO 3166-2 code: "US-CA" -> "CA", "CA-ON" -> "ON".
 *
 * Cities store the full code, which is right — "CA" alone is ambiguous between
 * California and Canada, and the country prefix is what makes it a real ISO
 * identifier. But nobody writes an address as "Santa Rosa, US-CA, United
 * States", so the prefix is dropped at the point of display and only there.
 *
 * A code with no prefix is returned unchanged, so this is safe to run over
 * anything already stored bare.
 */
export function subdivisionCode(regionCode: string): string {
  const dash = regionCode.indexOf("-");
  return dash === -1 ? regionCode : regionCode.slice(dash + 1);
}

/** "Toronto, ON, Canada" when a region is known, else "Berlin, Germany". */
export function formatLocation(
  city: string,
  regionCode: string | null,
  countryName: string,
): string {
  return regionCode
    ? `${city}, ${subdivisionCode(regionCode)}, ${countryName}`
    : `${city}, ${countryName}`;
}
