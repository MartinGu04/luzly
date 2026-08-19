/**
 * RFC 5545 (iCalendar) text encoding primitives -- escaping and line
 * folding. Pure, no Date/UTC, no domain knowledge: `icsRender.ts` is the
 * only caller, and every other calendar-feed module stays free of ICS
 * syntax details.
 */

/**
 * Escapes one TEXT value per RFC 5545 §3.3.11: backslash, semicolon, and
 * comma are backslash-escaped, and a real newline becomes the literal
 * two-character sequence `\n` -- never an actual CRLF/LF inside a
 * property value, which would corrupt the line structure. Order matters:
 * backslashes must be escaped FIRST, or the backslashes this function
 * itself inserts for `;`/`,`/newline would be escaped a second time.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const MAX_LINE_OCTETS = 75;

/**
 * Folds one already-escaped ICS content line to RFC 5545 §3.1's 75-octet
 * limit (excluding the line break), continuation lines prefixed with a
 * single space, joined with CRLF -- the exact "line folding" every
 * conforming parser expects, and what keeps a long Hebrew SUMMARY/
 * DESCRIPTION from producing a spec-invalid line.
 *
 * Splits on Unicode code points (`[...line]`), never UTF-16 code units --
 * splitting mid-surrogate-pair would corrupt an emoji. Octet counting
 * uses `Buffer.byteLength` per code point (UTF-8), matching the octet
 * (not character) unit RFC 5545 actually specifies -- Hebrew text is
 * multi-byte in UTF-8, so a character-count fold would silently produce
 * lines longer than 75 octets.
 */
export function foldIcsLine(line: string): string {
  const codePoints = [...line];
  if (Buffer.byteLength(line, "utf8") <= MAX_LINE_OCTETS) return line;

  const segments: string[] = [];
  let current = "";
  let currentOctets = 0;
  // The very first physical line has the full 75-octet budget; every
  // continuation line loses 1 octet to its mandatory leading space.
  let budget = MAX_LINE_OCTETS;

  for (const codePoint of codePoints) {
    const octets = Buffer.byteLength(codePoint, "utf8");
    if (currentOctets + octets > budget && current !== "") {
      segments.push(current);
      current = "";
      currentOctets = 0;
      budget = MAX_LINE_OCTETS - 1;
    }
    current += codePoint;
    currentOctets += octets;
  }
  if (current !== "") segments.push(current);

  return segments.map((segment, index) => (index === 0 ? segment : ` ${segment}`)).join("\r\n");
}

/** One CRLF-terminated, folded `NAME:value` (or `NAME;PARAM=x:value`) content line. */
export function buildIcsLine(nameAndParams: string, value: string): string {
  return `${foldIcsLine(`${nameAndParams}:${value}`)}\r\n`;
}
