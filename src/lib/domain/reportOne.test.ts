import { describe, expect, it } from "vitest";
import {
  buildReportOneDraft,
  classifyReportOneSection,
  resolveReportOneTargetDate,
  resolveRegularOrReserveStatus,
  UNKNOWN_REPORT_ONE_STATUS,
} from "./reportOne";
import type { Event } from "./event";
import type { LocalNow } from "./localNow";
import type { Person } from "./types";

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_test",
    name: "דני בדיקה",
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

function event(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_test",
    personName: "דני בדיקה",
    date: "2026-08-26",
    title: "",
    rawValue: "",
    category: "shift",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: nextCell(),
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: null,
    absenceKind: null,
    ...overrides,
  };
}

function shiftEvent(role: "supervisor" | "technician", period: "day" | "night", overrides: Partial<Event> = {}): Event {
  return event({ category: "shift", role, period, ...overrides });
}

function absenceEvent(absenceKind: NonNullable<Event["absenceKind"]>, overrides: Partial<Event> = {}): Event {
  return event({ category: "absence", role: null, period: "unspecified", absenceKind, ...overrides });
}

// --- 1-3. Tomorrow calculation --------------------------------------------

describe("resolveReportOneTargetDate", () => {
  it("1. an ordinary day: tomorrow is the next calendar date", () => {
    const now: LocalNow = { date: "2026-08-25", minuteOfDay: 600 };
    expect(resolveReportOneTargetDate(now)).toBe("2026-08-26");
  });

  it("2. month boundary: 31.8 -> 1.9", () => {
    const now: LocalNow = { date: "2026-08-31", minuteOfDay: 0 };
    expect(resolveReportOneTargetDate(now)).toBe("2026-09-01");
  });

  it("3. year boundary: 31.12 -> 1.1 of the next year", () => {
    const now: LocalNow = { date: "2026-12-31", minuteOfDay: 1439 };
    expect(resolveReportOneTargetDate(now)).toBe("2027-01-01");
  });
});

// --- 4-7. Section classification + exclusions -----------------------------

describe("classifyReportOneSection", () => {
  it("permanent (קבע) -> 'permanent'", () => {
    expect(classifyReportOneSection(person({ personnelType: "קבע" }))).toBe("permanent");
  });

  it("reserve (מילואים) -> 'reserve'", () => {
    expect(classifyReportOneSection(person({ personnelType: "מילואים" }))).toBe("reserve");
  });

  it("regular (חובה) + supervisor -> 'regular_manager'", () => {
    expect(classifyReportOneSection(person({ personnelType: "חובה", isSupervisor: true }))).toBe("regular_manager");
  });

  it("regular (חובה) + technician -> 'regular_technician'", () => {
    expect(classifyReportOneSection(person({ personnelType: "חובה", isTechnician: true }))).toBe("regular_technician");
  });

  it("regular (חובה) + neither supervisor nor technician -> no section", () => {
    expect(classifyReportOneSection(person({ personnelType: "חובה" }))).toBeNull();
  });

  it("unclassified -> no section", () => {
    expect(classifyReportOneSection(person({ personnelType: null }))).toBeNull();
  });
});

describe("buildReportOneDraft — permanent exclusions (5, 6, 7)", () => {
  const targetDate = "2026-08-26";
  const prevDate = "2026-08-25";

  it("5. דימה מירו is excluded", () => {
    const people = [person({ id: "p_dima", name: "דימה מירו", personnelType: "קבע" })];
    const draft = buildReportOneDraft({ people, events: [], targetDate, prevDate });
    expect(draft.sections.flatMap((s) => s.people).map((p) => p.name)).not.toContain("דימה מירו");
  });

  it("6. מרטין בדיקות is excluded", () => {
    const people = [person({ id: "p_martin", name: "מרטין בדיקות", personnelType: "קבע" })];
    const draft = buildReportOneDraft({ people, events: [], targetDate, prevDate });
    expect(draft.sections.flatMap((s) => s.people).map((p) => p.name)).not.toContain("מרטין בדיקות");
  });

  it("7. נדב וקנין is excluded", () => {
    const people = [person({ id: "p_nadav", name: "נדב וקנין", personnelType: "מילואים" })];
    const draft = buildReportOneDraft({ people, events: [], targetDate, prevDate });
    expect(draft.sections.flatMap((s) => s.people).map((p) => p.name)).not.toContain("נדב וקנין");
  });
});

// --- Permanent staff default to "?" -----------------------------------------

describe("buildReportOneDraft — permanent staff", () => {
  it("4. permanent staff always default to '?', never נוכח, regardless of schedule data", () => {
    const people = [person({ id: "p_perm", name: "עמנואל צגה", personnelType: "קבע" })];
    const events = [shiftEvent("supervisor", "day", { personId: "p_perm", date: "2026-08-26" })];
    const draft = buildReportOneDraft({ people, events, targetDate: "2026-08-26", prevDate: "2026-08-25" });
    const permanentGroup = draft.sections.find((s) => s.section === "permanent")!;
    expect(permanentGroup.people).toEqual([
      { personId: "p_perm", name: "עמנואל צגה", section: "permanent", generatedStatus: UNKNOWN_REPORT_ONE_STATUS },
    ]);
  });
});

// --- 8-15. resolveRegularOrReserveStatus wording ---------------------------

describe("resolveRegularOrReserveStatus", () => {
  it("8. אחמ\"ש day shift", () => {
    expect(resolveRegularOrReserveStatus([shiftEvent("supervisor", "day")], [])).toBe('נוכח, אחמ"ש יום');
  });

  it("9. אחמ\"ש night shift", () => {
    expect(resolveRegularOrReserveStatus([shiftEvent("supervisor", "night")], [])).toBe('נוכח, אחמ"ש לילה');
  });

  it("10. technician day shift", () => {
    expect(resolveRegularOrReserveStatus([shiftEvent("technician", "day")], [])).toBe("נוכח, טכנאי יום");
  });

  it("11. technician night shift", () => {
    expect(resolveRegularOrReserveStatus([shiftEvent("technician", "night")], [])).toBe("נוכח, טכנאי לילה");
  });

  it("12. vacation", () => {
    expect(resolveRegularOrReserveStatus([absenceEvent("vacation")], [])).toBe("חופש");
  });

  it("13. referral", () => {
    expect(resolveRegularOrReserveStatus([absenceEvent("referral")], [])).toBe("הפנייה");
  });

  it("14. admin/errand day (day_off)", () => {
    expect(resolveRegularOrReserveStatus([absenceEvent("day_off")], [])).toBe("יום סידורים");
  });

  it("15. after-night: a night shift on the previous day, nothing today -> 'נוכח, אחרי לילה'", () => {
    const prevDay = [shiftEvent("technician", "night", { date: "2026-08-25" })];
    expect(resolveRegularOrReserveStatus([], prevDay)).toBe("נוכח, אחרי לילה");
  });

  it("15b. an explicit 'אפטר' marker alone also resolves to after-night", () => {
    expect(resolveRegularOrReserveStatus([absenceEvent("after")], [])).toBe("נוכח, אחרי לילה");
  });

  it("18. no data at all -> '?'", () => {
    expect(resolveRegularOrReserveStatus([], [])).toBe(UNKNOWN_REPORT_ONE_STATUS);
  });

  it("20. existing conflict resolution respected: a blocking absence + an assignment on the same day never resolves to either -- falls back to '?'", () => {
    const events = [absenceEvent("vacation"), shiftEvent("technician", "day")];
    expect(resolveRegularOrReserveStatus(events, [])).toBe(UNKNOWN_REPORT_ONE_STATUS);
  });

  it("a referral + an assignment on the same day is also an unresolved conflict", () => {
    const events = [absenceEvent("referral"), shiftEvent("supervisor", "night")];
    expect(resolveRegularOrReserveStatus(events, [])).toBe(UNKNOWN_REPORT_ONE_STATUS);
  });

  it("two conflicting shift events on the same day never guess -- '?'", () => {
    const events = [shiftEvent("supervisor", "day"), shiftEvent("technician", "night")];
    expect(resolveRegularOrReserveStatus(events, [])).toBe(UNKNOWN_REPORT_ONE_STATUS);
  });
});

// --- 16-17. Reserve personnel ------------------------------------------------

describe("buildReportOneDraft — reserve personnel (16, 17)", () => {
  it("16. reserve personnel with a resolvable assignment reuses the SAME wording as סדיר", () => {
    const people = [person({ id: "p_res", name: "רועי לוין", personnelType: "מילואים", isSupervisor: true })];
    const events = [shiftEvent("supervisor", "night", { personId: "p_res", date: "2026-08-26" })];
    const draft = buildReportOneDraft({ people, events, targetDate: "2026-08-26", prevDate: "2026-08-25" });
    const reserveGroup = draft.sections.find((s) => s.section === "reserve")!;
    expect(reserveGroup.people[0].generatedStatus).toBe('נוכח, אחמ"ש לילה');
  });

  it("17. reserve personnel with no authoritative status falls back to '?'", () => {
    const people = [person({ id: "p_res2", name: "אלמוני מילואים", personnelType: "מילואים" })];
    const draft = buildReportOneDraft({ people, events: [], targetDate: "2026-08-26", prevDate: "2026-08-25" });
    const reserveGroup = draft.sections.find((s) => s.section === "reserve")!;
    expect(reserveGroup.people[0].generatedStatus).toBe(UNKNOWN_REPORT_ONE_STATUS);
  });
});

// --- 19. A person cannot appear in multiple sections ------------------------

describe("buildReportOneDraft — structural invariants (19, 21)", () => {
  it("19. every person appears in exactly one section", () => {
    const people = [
      person({ id: "p_perm", name: "עמנואל צגה", personnelType: "קבע" }),
      person({ id: "p_res", name: "רועי לוין", personnelType: "מילואים" }),
      person({ id: "p_sup", name: "עילאי שפירא", personnelType: "חובה", isSupervisor: true }),
      person({ id: "p_tech", name: "איתי אוליר", personnelType: "חובה", isTechnician: true }),
    ];
    const draft = buildReportOneDraft({ people, events: [], targetDate: "2026-08-26", prevDate: "2026-08-25" });

    const allIds = draft.sections.flatMap((section) => section.people.map((p) => p.personId));
    expect(allIds).toHaveLength(4);
    expect(new Set(allIds).size).toBe(4);
  });

  it("21. personnel ordering remains stable -- never reordered alphabetically or by status", () => {
    const people = [
      person({ id: "p_c", name: "גדעון פולין", personnelType: "חובה", isTechnician: true }),
      person({ id: "p_a", name: "איתי אוליר", personnelType: "חובה", isTechnician: true }),
      person({ id: "p_b", name: "בן בדיקה", personnelType: "חובה", isTechnician: true }),
    ];
    const draft = buildReportOneDraft({ people, events: [], targetDate: "2026-08-26", prevDate: "2026-08-25" });
    const technicians = draft.sections.find((s) => s.section === "regular_technician")!;
    expect(technicians.people.map((p) => p.name)).toEqual(["גדעון פולין", "איתי אוליר", "בן בדיקה"]);
  });

  it("section ordering is always אנשי קבע -> מילואים -> אחמשים -> טכנאים, even if empty", () => {
    const draft = buildReportOneDraft({ people: [], events: [], targetDate: "2026-08-26", prevDate: "2026-08-25" });
    expect(draft.sections.map((s) => s.section)).toEqual(["permanent", "reserve", "regular_manager", "regular_technician"]);
  });
});
