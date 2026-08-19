import { describe, expect, it, vi } from "vitest";
import type { RawSheet, RawWorkbookSnapshot } from "@/lib/google";
import { SHEET_SOURCES } from "@/lib/google";

const resolveCalendarFeedOwnerByToken = vi.fn();
vi.mock("./feedOwnerLookup", () => ({ resolveCalendarFeedOwnerByToken: (token: string) => resolveCalendarFeedOwnerByToken(token) }));

const getWorkbookSnapshot = vi.fn();
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot: (sources: unknown) => getWorkbookSnapshot(sources) }));

const { loadCalendarFeedForToken } = await import("./loadCalendarFeedForToken");

const PERSONNEL_SHEET: RawSheet = {
  name: SHEET_SOURCES.personnel,
  values: [
    ["שם", "מייל", "מנהל", "טכנאי", 'אחמ"ש', 'סוג כ"א'],
    ["דני בדיקה", "dani@example.com", "false", "false", "true", "קבוע"],
    ["נועה דוגמה", "noa@example.com", "false", "true", "false", "קבוע"],
  ],
};

const SCHEDULE_SHEET: RawSheet = {
  name: SHEET_SOURCES.schedule,
  values: [
    ["תאריך", "יום", "דני בדיקה", "נועה דוגמה"],
    ["19/08/2026", "ד", 'אחמ"ש יום', "טכנאי לילה"],
    ["20/08/2026", "ה", "שומר 1", "חופש"],
  ],
};

const SETTINGS_SHEET: RawSheet = {
  name: SHEET_SOURCES.settings,
  values: [
    ["הגדרה", "ערך"],
    ["תחילת משמרת יום", "07:30"],
  ],
};

const EMPTY_POTENTIAL_SHEET = (name: string): RawSheet => ({ name, values: [["תאריך", "יום"]] });

function makeSnapshot(): RawWorkbookSnapshot {
  return {
    fetchedAt: "2026-08-19T00:00:00.000Z",
    sheets: [
      PERSONNEL_SHEET,
      SCHEDULE_SHEET,
      SETTINGS_SHEET,
      EMPTY_POTENTIAL_SHEET(SHEET_SOURCES.potentialH1),
      EMPTY_POTENTIAL_SHEET(SHEET_SOURCES.potentialH2),
    ],
  };
}

describe("loadCalendarFeedForToken", () => {
  it("returns not_found without ever fetching the workbook when the token doesn't resolve", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "not_found" });
    getWorkbookSnapshot.mockReset();

    const result = await loadCalendarFeedForToken("bad-token");

    expect(result).toEqual({ status: "not_found" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("returns not_found when the owner's email doesn't map to any כ\"א person", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "stranger@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeSnapshot());

    expect(await loadCalendarFeedForToken("tok")).toEqual({ status: "not_found" });
  });

  it("renders only the resolved person's own shift/duty/absence events, never a colleague's", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeSnapshot());

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).toContain('SUMMARY:אחמ"ש יום');
    expect(result.icsText).toContain("SUMMARY:שמירה 1");
    expect(result.icsText).not.toContain("טכנאי לילה");
    expect(result.icsText).not.toContain("SUMMARY:חופש");
  });

  it("a different person's own token sees only THEIR events", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "noa@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeSnapshot());

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).toContain("טכנאי לילה");
    expect(result.icsText).toContain("SUMMARY:חופש");
    expect(result.icsText).not.toContain('אחמ"ש יום');
    expect(result.icsText).not.toContain("שמירה 1");
  });

  it("produces a valid, non-empty VCALENDAR document", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeSnapshot());

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.icsText.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(result.icsText.trim().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("still returns a feed (skipping shift events, keeping duties) when the shift-time configuration is broken", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue({
      ...makeSnapshot(),
      sheets: makeSnapshot().sheets.map((sheet) =>
        sheet.name === SHEET_SOURCES.settings ? { name: SHEET_SOURCES.settings, values: [["הגדרה", "ערך"]] } : sheet,
      ),
    });

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.icsText).not.toContain('אחמ"ש יום');
    expect(result.icsText).toContain("SUMMARY:שמירה 1");
  });
});
