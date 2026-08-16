/**
 * Trims and collapses whitespace in a raw search-box query -- the one
 * normalization every intent parser downstream can rely on having already
 * happened. Hebrew has no case to fold; Latin-text case-insensitivity and
 * date-punctuation tolerance (`.`/`/`/`-`) are handled at the point of use
 * (person-name matching, date-token parsing) since they're type-specific,
 * not a generic query-wide transform.
 */
export function normalizeSearchQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}
