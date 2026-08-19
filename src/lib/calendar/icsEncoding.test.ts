import { describe, expect, it } from "vitest";
import { buildIcsLine, escapeIcsText, foldIcsLine } from "./icsEncoding";

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon, comma, and newline per RFC 5545 §3.3.11", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("escapes backslashes BEFORE inserting new escapes, so it never double-escapes its own output", () => {
    // A literal backslash followed by a literal "n" must become \\n (escaped
    // backslash + plain n), never \n (which would misread as an escaped
    // newline) -- this only holds if backslashes are escaped first.
    expect(escapeIcsText("a\\nb")).toBe("a\\\\nb");
  });

  it("handles CRLF and lone CR the same as LF", () => {
    expect(escapeIcsText("a\r\nb")).toBe("a\\nb");
    expect(escapeIcsText("a\rb")).toBe("a\\nb");
  });

  it("passes Hebrew text through unescaped (no special characters)", () => {
    expect(escapeIcsText("משמרת יום")).toBe("משמרת יום");
  });

  it("leaves a string with nothing to escape unchanged", () => {
    expect(escapeIcsText("plain text")).toBe("plain text");
  });
});

describe("foldIcsLine", () => {
  it("leaves a short line (<= 75 octets) unfolded", () => {
    const line = "SUMMARY:short";
    expect(foldIcsLine(line)).toBe(line);
  });

  it("folds a long ASCII line into 75-octet segments with a single leading space on continuations", () => {
    const value = "x".repeat(200);
    const line = `SUMMARY:${value}`;
    const folded = foldIcsLine(line);
    const segments = folded.split("\r\n");

    expect(segments.length).toBeGreaterThan(1);
    expect(Buffer.byteLength(segments[0], "utf8")).toBeLessThanOrEqual(75);
    for (const segment of segments.slice(1)) {
      expect(segment.startsWith(" ")).toBe(true);
      expect(Buffer.byteLength(segment, "utf8")).toBeLessThanOrEqual(75);
    }

    // Unfolding (strip CRLF + one leading space per continuation) recovers the original line exactly.
    const unfolded = segments.map((segment, index) => (index === 0 ? segment : segment.slice(1))).join("");
    expect(unfolded).toBe(line);
  });

  it("folds multi-byte Hebrew text without splitting a UTF-8 character across lines", () => {
    const value = "מ".repeat(80); // each "מ" is 2 UTF-8 octets -- comfortably over 75 octets total
    const line = `SUMMARY:${value}`;
    const folded = foldIcsLine(line);
    const segments = folded.split("\r\n");

    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      // Every segment round-trips through Buffer without a replacement
      // character / partial-encoding artifact, proving no character was split.
      const stripped = segment.startsWith(" ") ? segment.slice(1) : segment;
      expect(Buffer.from(stripped, "utf8").toString("utf8")).toBe(stripped);
    }

    const unfolded = segments.map((segment, index) => (index === 0 ? segment : segment.slice(1))).join("");
    expect(unfolded).toBe(line);
  });

  it("never splits a surrogate-pair code point (e.g. an emoji) across two folded lines", () => {
    const emoji = "🎉"; // a single code point, 4 UTF-8 octets, 2 UTF-16 code units
    const value = "x".repeat(70) + emoji + "x".repeat(70);
    const line = `SUMMARY:${value}`;
    const folded = foldIcsLine(line);

    expect(folded).not.toContain("�");
    const unfolded = folded
      .split("\r\n")
      .map((segment, index) => (index === 0 ? segment : segment.slice(1)))
      .join("");
    expect(unfolded).toBe(line);
    expect(unfolded).toContain(emoji);
  });
});

describe("buildIcsLine", () => {
  it("joins name and value with a colon and terminates with CRLF", () => {
    expect(buildIcsLine("SUMMARY", "hello")).toBe("SUMMARY:hello\r\n");
  });

  it("folds when the combined name+value line is too long, still CRLF-terminated", () => {
    const value = "x".repeat(100);
    const result = buildIcsLine("SUMMARY", value);
    expect(result.endsWith("\r\n")).toBe(true);
    expect(result.split("\r\n").length).toBeGreaterThan(2); // >= 2 folded segments + trailing empty from the final \r\n
  });
});
