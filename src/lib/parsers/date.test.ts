import { afterEach, describe, expect, it } from "vitest";
import { parseLocalDate } from "./date";

describe("parseLocalDate", () => {
  it("passes through an ISO date, zero-padded", () => {
    expect(parseLocalDate("2026-1-5")).toBe("2026-01-05");
    expect(parseLocalDate("2026-01-05")).toBe("2026-01-05");
  });

  it("converts DD/MM/YYYY (Israeli date format)", () => {
    expect(parseLocalDate("05/01/2026")).toBe("2026-01-05");
  });

  it("converts DD.MM.YYYY", () => {
    expect(parseLocalDate("31.12.2026")).toBe("2026-12-31");
  });

  it("returns null instead of throwing for unrecognized text", () => {
    expect(parseLocalDate("חופש")).toBeNull();
    expect(parseLocalDate("")).toBeNull();
  });

  describe("a trailing time-of-day component is tolerated and discarded", () => {
    it("DD/MM/YYYY with a midnight time suffix (Google Sheets 'Date time' cell format rendering)", () => {
      expect(parseLocalDate("29/06/2026 0:00:00")).toBe("2026-06-29");
      expect(parseLocalDate("29/06/2026 00:00:00")).toBe("2026-06-29");
      expect(parseLocalDate("29/06/2026 00:00")).toBe("2026-06-29");
    });

    it("DD.MM.YYYY with a non-midnight time suffix -- only the date part is ever used", () => {
      expect(parseLocalDate("29.06.2026 14:35:07")).toBe("2026-06-29");
    });

    it("ISO date with a 'T' time suffix", () => {
      expect(parseLocalDate("2026-06-29T00:00:00")).toBe("2026-06-29");
    });

    it("ISO date with a space-separated time suffix", () => {
      expect(parseLocalDate("2026-06-29 00:00:00")).toBe("2026-06-29");
    });

    it("still rejects genuinely malformed trailing text -- never a partial/fuzzy match", () => {
      expect(parseLocalDate("29/06/2026 not-a-time")).toBeNull();
      expect(parseLocalDate("29/06/2026extra")).toBeNull();
    });
  });

  describe("timezone independence", () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it("gives the identical result regardless of the process timezone", () => {
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14
      const ahead = parseLocalDate("01/01/2026");

      process.env.TZ = "Etc/GMT+12"; // UTC-12
      const behind = parseLocalDate("01/01/2026");

      expect(ahead).toBe("2026-01-01");
      expect(behind).toBe("2026-01-01");
    });
  });
});
