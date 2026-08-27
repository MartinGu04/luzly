import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet, RawWorkbookSnapshot } from "@/lib/google";
import { SHEET_SOURCES } from "@/lib/google";
import { stableIdFromName } from "@/lib/parsers/personnel";

const resolveCalendarFeedOwnerByToken = vi.fn();
vi.mock("./feedOwnerLookup", () => ({ resolveCalendarFeedOwnerByToken: (token: string) => resolveCalendarFeedOwnerByToken(token) }));

const getWorkbookSnapshot = vi.fn();
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot: (sources: unknown) => getWorkbookSnapshot(sources) }));

const resolveOperationalMode = vi.fn();
vi.mock("@/lib/emergencyMode/state", () => ({ resolveOperationalMode: () => resolveOperationalMode() }));

const resolveOperationalRoster = vi.fn();
vi.mock("@/lib/readModels/operationalMode", () => ({ resolveOperationalRoster: (people: unknown) => resolveOperationalRoster(people) }));

/** Every EXISTING test in this file exercises regular mode -- defaulting here means none of them need to know Emergency Mode exists. Only the dedicated "Emergency Mode" describe block below overrides this. */
beforeEach(() => {
  resolveOperationalMode.mockReset();
  resolveOperationalMode.mockResolvedValue({ kind: "regular" });
  resolveOperationalRoster.mockReset();
});

/** Fixed "now" for every test -- never the real system clock, so the 30-day window's boundary tests stay exact regardless of when this suite actually runs. Partial mock: `jerusalemLocalTimeToInstant` (used by icsItems.ts for real shift timing) stays the real implementation -- only `getJerusalemLocalNow` (the window's "now") is overridden. */
const NOW = { date: "2026-08-19", minuteOfDay: 600 };
const getJerusalemLocalNow = vi.fn(() => NOW);
vi.mock("@/lib/time/jerusalemClock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/time/jerusalemClock")>();
  return { ...actual, getJerusalemLocalNow: () => getJerusalemLocalNow() };
});

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

/**
 * Spans the 30-day window's boundary (relative to NOW = 2026-08-19, cutoff
 * = 2026-07-20): one date well before the cutoff, one exactly one day
 * before it, one exactly ON it, one on "today", and one far in the
 * future -- each a distinct guard slot so the assertions can pin down
 * exactly which dates survived.
 */
const HISTORY_SCHEDULE_SHEET: RawSheet = {
  name: SHEET_SOURCES.schedule,
  values: [
    ["תאריך", "יום", "דני בדיקה"],
    ["01/06/2026", "ב", "שומר 1"], // well before cutoff
    ["19/07/2026", "א", "שומר 2"], // cutoff - 1 day
    ["20/07/2026", "ב", "שומר 3"], // exactly at cutoff (inclusive)
    ["19/08/2026", "ד", "שומר 4"], // today
    ["01/01/2027", "ו", "שומר 5"], // far future
  ],
};

function makeHistorySnapshot(): RawWorkbookSnapshot {
  return {
    fetchedAt: "2026-08-19T00:00:00.000Z",
    sheets: [
      PERSONNEL_SHEET,
      HISTORY_SCHEDULE_SHEET,
      SETTINGS_SHEET,
      EMPTY_POTENTIAL_SHEET(SHEET_SOURCES.potentialH1),
      EMPTY_POTENTIAL_SHEET(SHEET_SOURCES.potentialH2),
    ],
  };
}

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

    expect(result.icsText).toContain('SUMMARY:☀️ אחמ"ש יום');
    expect(result.icsText).toContain("SUMMARY:🛡️ שמירה 1");
    expect(result.icsText).not.toContain("טכנאי לילה");
    expect(result.icsText).not.toContain("SUMMARY:🏖️ חופש");
  });

  it("a different person's own token sees only THEIR events", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "noa@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeSnapshot());

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).toContain("טכנאי לילה");
    expect(result.icsText).toContain("SUMMARY:🏖️ חופש");
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
    expect(result.icsText).toContain("SUMMARY:🛡️ שמירה 1");
  });
});

describe("loadCalendarFeedForToken -- 30-day past window (future unbounded)", () => {
  it("excludes an event well before the cutoff, and the day immediately before it", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeHistorySnapshot());

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).not.toContain("שמירה 1"); // 2026-06-01, well before cutoff
    expect(result.icsText).not.toContain("שמירה 2"); // 2026-07-19, cutoff - 1 day
  });

  it("includes the cutoff date itself (inclusive lower bound), today, and any future date (no upper bound)", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeHistorySnapshot());

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).toContain("SUMMARY:🛡️ שמירה 3"); // 2026-07-20, exactly the cutoff
    expect(result.icsText).toContain("SUMMARY:🛡️ שמירה 4"); // 2026-08-19, today
    expect(result.icsText).toContain("SUMMARY:🛡️ שמירה 5"); // 2027-01-01, far future
  });

  it("produces exactly 3 VEVENTs -- the 2 out-of-window dates never even reach ICS rendering", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeHistorySnapshot());

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });

  it("the in-app personal schedule's own calendar-worthy category filter is reused unchanged -- this window is layered on top of it, not a replacement", async () => {
    // Sanity check that windowing doesn't accidentally also filter by
    // category: an old, out-of-window date and a same-day-as-cutoff date
    // are both still real "shift"/"duty" Events, distinguished ONLY by
    // date here -- see icsWindow.ts's own docstring for why this is
    // layered on top of (never inside) isCalendarDisplayEvent.
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeHistorySnapshot());

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.icsText).toContain("DTSTART;VALUE=DATE:20260720");
  });
});

const SWAP_SCHEDULE_SHEET: RawSheet = {
  name: SHEET_SOURCES.schedule,
  values: [
    ["תאריך", "יום", "דני בדיקה"],
    ["08/09/2026", "ג", "שומר 4"],
    ["09/09/2026", "ד", "שומר 4"],
    ["10/09/2026", "ה", "שומר 4"],
  ],
};

const SWAP_POTENTIAL_H2_SHEET: RawSheet = {
  name: SHEET_SOURCES.potentialH2,
  values: [
    ["תאריך", "יום", "שומר 4"],
    ["06/09/2026", "א", "דני בדיקה"],
  ],
};

function makeSwapSnapshot(): RawWorkbookSnapshot {
  return {
    fetchedAt: "2026-08-19T00:00:00.000Z",
    sheets: [
      PERSONNEL_SHEET,
      SWAP_SCHEDULE_SHEET,
      SETTINGS_SHEET,
      EMPTY_POTENTIAL_SHEET(SHEET_SOURCES.potentialH1),
      SWAP_POTENTIAL_H2_SHEET,
    ],
  };
}

describe("loadCalendarFeedForToken -- Potential source-precedence swap regression (production-shaped, no independent construction path)", () => {
  it("never renders a phantom guard-4 event on the stale 06/09 Potential date once the real internal duty moved to 08-10/09 within the same week -- exactly buildPotentialDutyEvents' own dedup, no second reconciliation here", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeSwapSnapshot());

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).not.toContain("DTSTART;VALUE=DATE:20260906");
    expect(result.icsText).not.toContain("DTSTART;VALUE=DATE:20260907");
    expect(result.icsText).toContain("DTSTART;VALUE=DATE:20260908");
    expect(result.icsText).toContain("DTSTART;VALUE=DATE:20260909");
    expect(result.icsText).toContain("DTSTART;VALUE=DATE:20260910");
    expect(result.icsText.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });
});

describe("loadCalendarFeedForToken -- shift roster in DESCRIPTION (end-to-end, dynamic)", () => {
  const ROSTER_PERSONNEL_SHEET: RawSheet = {
    name: SHEET_SOURCES.personnel,
    values: [
      ["שם", "מייל", "מנהל", "טכנאי", 'אחמ"ש', 'סוג כ"א'],
      ["דני בדיקה", "dani@example.com", "false", "false", "true", "קבוע"],
      ["נועה דוגמה", "noa@example.com", "false", "true", "false", "קבוע"],
      ["איתן דוגמה", "eitan@example.com", "false", "false", "true", "קבוע"],
    ],
  };

  /** Dani (supervisor) and Noa (technician) share the SAME day shift; Eitan (supervisor) is on the NIGHT shift the same date -- an unrelated shift that must never leak into the day shift's roster. */
  function rosterScheduleSheet(noaAssignment: string): RawSheet {
    return {
      name: SHEET_SOURCES.schedule,
      values: [
        ["תאריך", "יום", "דני בדיקה", "נועה דוגמה", "איתן דוגמה"],
        ["19/08/2026", "ד", 'אחמ"ש יום', noaAssignment, 'אחמ"ש לילה'],
      ],
    };
  }

  function rosterSnapshot(noaAssignment: string): RawWorkbookSnapshot {
    return {
      fetchedAt: "2026-08-19T00:00:00.000Z",
      sheets: [
        ROSTER_PERSONNEL_SHEET,
        rosterScheduleSheet(noaAssignment),
        SETTINGS_SHEET,
        EMPTY_POTENTIAL_SHEET(SHEET_SOURCES.potentialH1),
        EMPTY_POTENTIAL_SHEET(SHEET_SOURCES.potentialH2),
      ],
    };
  }

  it("includes the day-shift colleague in the DESCRIPTION, grouped by role", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(rosterSnapshot("טכנאי יום"));

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).toContain("DESCRIPTION:איתך במשמרת:\\nטכנאים: נועה דוגמה");
  });

  it("is symmetric: the technician's own feed lists the supervisor", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "noa@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(rosterSnapshot("טכנאי יום"));

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).toContain('DESCRIPTION:איתך במשמרת:\\nאחמ"ש: דני בדיקה');
  });

  it("never leaks the night-shift supervisor (same date, different period) into the day shift's roster", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(rosterSnapshot("טכנאי יום"));

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).not.toContain("איתן דוגמה");
  });

  it("is rebuilt on every request: reassigning the colleague away updates the DESCRIPTION on the next fetch", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });

    getWorkbookSnapshot.mockResolvedValueOnce(rosterSnapshot("טכנאי יום"));
    const before = await loadCalendarFeedForToken("tok");
    expect(before.status).toBe("ok");
    if (before.status !== "ok") return;
    expect(before.icsText).toContain("נועה דוגמה");

    // Noa is reassigned off this shift (now on vacation instead) -- a fresh fetch of the SAME token/person.
    getWorkbookSnapshot.mockResolvedValueOnce(rosterSnapshot("חופש"));
    const after = await loadCalendarFeedForToken("tok");
    expect(after.status).toBe("ok");
    if (after.status !== "ok") return;
    expect(after.icsText).not.toContain("נועה דוגמה");
    // No roster left at all (Eitan is on a different shift) -- DESCRIPTION is simply absent for this VEVENT.
    expect(after.icsText).not.toContain("DESCRIPTION");
  });

  it("preserves the exact same UID across the roster change above -- an update, never a duplicate VEVENT", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });

    getWorkbookSnapshot.mockResolvedValueOnce(rosterSnapshot("טכנאי יום"));
    const before = await loadCalendarFeedForToken("tok");
    getWorkbookSnapshot.mockResolvedValueOnce(rosterSnapshot("חופש"));
    const after = await loadCalendarFeedForToken("tok");
    expect(before.status).toBe("ok");
    expect(after.status).toBe("ok");
    if (before.status !== "ok" || after.status !== "ok") return;

    // RFC 5545 unfolding (reverse of icsEncoding.ts's foldIcsLine): a CRLF
    // immediately followed by a single space is a fold point, not a real
    // line break -- the UID's 64-hex-char hash + "@mi-ma-mo.app" suffix
    // together exceed the 75-octet line limit, so it's genuinely folded
    // across two physical lines in real output; this must be undone
    // before comparing the logical UID value.
    const uidOf = (icsText: string) => icsText.replace(/\r\n /g, "").match(/UID:([0-9a-f]{64}@[^\r\n]+)/)?.[1];
    expect(uidOf(before.icsText)).toBeDefined();
    expect(uidOf(before.icsText)).toBe(uidOf(after.icsText));
    // Exactly one VEVENT throughout -- the roster/description change never produced a second, duplicate entry.
    expect(before.icsText.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(after.icsText.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});

const EMERGENCY_PERIOD = {
  id: "period1",
  activatedAt: "2026-08-19T06:00:00.000Z",
  activatedByUserId: "u_mgr",
  activatedByPersonId: "p_mgr",
  activatedByPersonName: "מנהל בדיקה",
  startDate: "2026-08-19",
  deactivatedAt: null,
  deactivatedByUserId: null,
  deactivatedByPersonId: null,
  deactivatedByPersonName: null,
  endDate: null,
};

describe("loadCalendarFeedForToken -- Emergency Mode (spec section 16)", () => {
  it("while Emergency Mode is active, the feed comes from desk assignments -- never the regular schedule/Potential sheets", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeSnapshot());
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: EMERGENCY_PERIOD });
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: EMERGENCY_PERIOD,
      assignments: [
        { date: "2026-08-19", period: "day", desk: "הוגוורט", personId: stableIdFromName("דני בדיקה"), personName: "דני בדיקה", sourceCell: "C2" },
        { date: "2026-08-19", period: "day", desk: "תיעוד", personId: stableIdFromName("נועה דוגמה"), personName: "נועה דוגמה", sourceCell: "J2" },
      ],
      diagnostics: [],
      fetchedAt: "2026-08-19T09:00:00.000Z",
    });

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).toContain("דסק הוגוורט");
    expect(result.icsText).toContain("נועה דוגמה -- תיעוד");
    // Never the regular fixture's own summary text for this same date.
    expect(result.icsText).not.toContain('אחמ"ש יום');
    expect(result.icsText).not.toContain("שמירה 1");
  });

  it("a broken emergency workbook renders an EMPTY but still valid feed -- never a silent fallback to regular schedule data", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeSnapshot());
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: EMERGENCY_PERIOD });
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency_unavailable",
      period: EMERGENCY_PERIOD,
      message: "Missing GOOGLE_EMERGENCY_SPREADSHEET_ID.",
    });

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.icsText).not.toContain("BEGIN:VEVENT");
    expect(result.icsText).not.toContain('אחמ"ש יום');
    expect(result.icsText).not.toContain("שמירה 1");
  });

  it("a date outside the ICS feed's window is excluded, same 30-day-past rule the regular feed uses", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeSnapshot());
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: EMERGENCY_PERIOD });
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: EMERGENCY_PERIOD,
      assignments: [
        { date: "2026-01-01", period: "day", desk: "הוגוורט", personId: stableIdFromName("דני בדיקה"), personName: "דני בדיקה", sourceCell: "C2" },
      ],
      diagnostics: [],
      fetchedAt: "2026-08-19T09:00:00.000Z",
    });

    const result = await loadCalendarFeedForToken("tok");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.icsText).not.toContain("BEGIN:VEVENT");
  });

  it("resolves the roster against the SAME already-parsed personnel, never a second fetch", async () => {
    resolveCalendarFeedOwnerByToken.mockReset().mockResolvedValue({ status: "ok", email: "dani@example.com" });
    getWorkbookSnapshot.mockReset().mockResolvedValue(makeSnapshot());
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: EMERGENCY_PERIOD });
    resolveOperationalRoster.mockResolvedValue({
      mode: "emergency",
      period: EMERGENCY_PERIOD,
      assignments: [],
      diagnostics: [],
      fetchedAt: "2026-08-19T09:00:00.000Z",
    });

    await loadCalendarFeedForToken("tok");

    expect(getWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(resolveOperationalRoster).toHaveBeenCalledTimes(1);
  });
});
