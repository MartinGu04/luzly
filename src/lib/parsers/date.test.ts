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
