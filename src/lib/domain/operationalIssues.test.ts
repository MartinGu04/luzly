import { describe, expect, it } from "vitest";
import type { AbsenceKind, Event } from "./event";
import type { Person } from "./types";
import { buildShiftSchedule } from "./shiftSchedule";
import type { WeaponQualificationInfo } from "./shootingRangeQualification";
import {
  detectBlockingAbsenceIssues,
  detectCapabilityMismatchIssues,
  detectOperationalIssues,
  detectShiftTimingIssues,
  detectWeaponQualificationIssues,
} from "./operationalIssues";

const schedule = buildShiftSchedule("07:30"); // day 07:30-19:30, night 19:30-07:30(+1)

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_test",
    personName: "דני בדיקה",
    date: "2026-01-05",
    title: "טכנאי יום",
    rawValue: "טכנאי יום",
    category: "shift",
    certainty: "confirmed",
    role: "technician",
    period: "day",
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

function technicianShift(overrides: Partial<Event> = {}): Event {
  return makeEvent({ category: "shift", role: "technician", period: "day", ...overrides });
}

function supervisorShift(overrides: Partial<Event> = {}): Event {
  return makeEvent({
    category: "shift",
    role: "supervisor",
    period: "day",
    title: 'אחמ"ש יום',
    rawValue: 'אחמ"ש יום',
    ...overrides,
  });
}

function dutyEvent(overrides: Partial<Event> = {}): Event {
  return makeEvent({
    category: "duty",
    role: null,
    period: "unspecified",
    dutyFamily: "oxid",
    title: "אוקסיד",
    rawValue: "אוקסיד",
    ...overrides,
  });
}

const ABSENCE_TEXT: Record<AbsenceKind, string> = {
  vacation: "חופש",
  abroad: 'חו"ל',
  medical: "גימלים",
  day_off: "יום ד",
  after: "אפטר",
  referral: "הפנייה",
};

function absenceEvent(kind: AbsenceKind, overrides: Partial<Event> = {}): Event {
  const text = ABSENCE_TEXT[kind];
  return makeEvent({
    category: "absence",
    role: null,
    period: "unspecified",
    absenceKind: kind,
    title: text,
    rawValue: text,
    ...overrides,
  });
}

function statusEvent(overrides: Partial<Event> = {}): Event {
  return makeEvent({
    category: "status",
    role: null,
    period: "unspecified",
    title: "סוגר",
    rawValue: "סוגר",
    ...overrides,
  });
}

function contextEvent(overrides: Partial<Event> = {}): Event {
  return makeEvent({
    category: "context",
    role: null,
    period: "unspecified",
    title: "מלחמה",
    rawValue: "מלחמה",
    ...overrides,
  });
}

function otherEvent(overrides: Partial<Event> = {}): Event {
  return makeEvent({
    category: "other",
    role: null,
    period: "unspecified",
    title: "ניקיון כללי",
    rawValue: "ניקיון כללי",
    ...overrides,
  });
}

function changeNoteEvent(overrides: Partial<Event> = {}): Event {
  const text = "אוקסיד - הוחלף עם Test User";
  return makeEvent({
    category: "change_note",
    role: null,
    period: "unspecified",
    changeNote: text,
    title: text,
    rawValue: text,
    ...overrides,
  });
}

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_test",
    name: "דני בדיקה",
    email: null,
    isManager: false,
    isTechnician: true,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

describe("detectBlockingAbsenceIssues — rule 1", () => {
  it("1. vacation + shift -> critical", () => {
    const issues = detectBlockingAbsenceIssues([absenceEvent("vacation"), technicianShift()]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      reason: "blocking_absence_with_assignment",
      severity: "critical",
      personId: "p_test",
      date: "2026-01-05",
    });
  });

  it("2. abroad + shift -> critical", () => {
    const issues = detectBlockingAbsenceIssues([absenceEvent("abroad"), technicianShift()]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("critical");
  });

  it("3. abroad + duty -> critical", () => {
    const issues = detectBlockingAbsenceIssues([absenceEvent("abroad"), dutyEvent()]);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toBe("blocking_absence_with_assignment");
  });

  it("4. medical + duty -> critical", () => {
    const issues = detectBlockingAbsenceIssues([absenceEvent("medical"), dutyEvent()]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("critical");
  });

  it("5. day_off + shift -> critical", () => {
    const issues = detectBlockingAbsenceIssues([absenceEvent("day_off"), technicianShift()]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("critical");
  });

  it("6. after + shift does NOT auto-create a blocking absence issue", () => {
    const issues = detectBlockingAbsenceIssues([absenceEvent("after"), technicianShift()]);
    expect(issues).toEqual([]);
  });

  it("7. shift + oxid (no absence at all) is not inherently a conflict", () => {
    const issues = detectBlockingAbsenceIssues([technicianShift(), dutyEvent()]);
    expect(issues).toEqual([]);
  });

  it("8. absence + status is not flagged (status is not an assignment)", () => {
    const issues = detectBlockingAbsenceIssues([absenceEvent("vacation"), statusEvent()]);
    expect(issues).toEqual([]);
  });

  it("absence + context is not flagged", () => {
    expect(detectBlockingAbsenceIssues([absenceEvent("vacation"), contextEvent()])).toEqual([]);
  });

  it("absence + other is not flagged", () => {
    expect(detectBlockingAbsenceIssues([absenceEvent("vacation"), otherEvent()])).toEqual([]);
  });

  it("absence + change_note is not flagged", () => {
    expect(detectBlockingAbsenceIssues([absenceEvent("vacation"), changeNoteEvent()])).toEqual([]);
  });

  it("9. shift + free text (other) is not inherently a conflict", () => {
    expect(detectBlockingAbsenceIssues([technicianShift(), otherEvent()])).toEqual([]);
  });

  it("multiple duties and multiple free-text Events remain valid by default", () => {
    const issues = detectBlockingAbsenceIssues([
      dutyEvent(),
      dutyEvent({ dutyFamily: "rasar", title: 'רס"ר', rawValue: 'רס"ר' }),
      otherEvent(),
      otherEvent({ title: "משהו אחר", rawValue: "משהו אחר" }),
    ]);
    expect(issues).toEqual([]);
  });

  it("does not pair a blocking absence with an assignment on a different date", () => {
    const issues = detectBlockingAbsenceIssues([
      absenceEvent("vacation", { date: "2026-01-05" }),
      technicianShift({ date: "2026-01-06" }),
    ]);
    expect(issues).toEqual([]);
  });

  it("does not pair a blocking absence with a different person's assignment", () => {
    const issues = detectBlockingAbsenceIssues([
      absenceEvent("vacation", { personId: "p_1" }),
      technicianShift({ personId: "p_2" }),
    ]);
    expect(issues).toEqual([]);
  });

  it("produces one issue per (absence, assignment) pair — two assignments stay distinguishable", () => {
    const absence = absenceEvent("vacation");
    const shift = technicianShift();
    const duty = dutyEvent();
    const issues = detectBlockingAbsenceIssues([absence, shift, duty]);
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.targetEvent)).toEqual(expect.arrayContaining([shift, duty]));
  });
});

describe("detectShiftTimingIssues — rules 2 & 3", () => {
  it("11. missing technician coverage -> critical", () => {
    const supervisor = supervisorShift();
    const issues = detectShiftTimingIssues([supervisor], schedule);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ reason: "shift_coverage_missing", severity: "critical" });
    expect(issues[0].targetEvent).toBe(supervisor);
    expect(issues[0].missingIntervals).toEqual([{ startMinute: 450, endMinute: 1170 }]);
  });

  it("12. partial technician coverage -> critical with the exact gap", () => {
    const supervisor = supervisorShift();
    const techA = technicianShift({ endTimeOverride: "11:00" });
    const techB = technicianShift({ startTimeOverride: "12:00" });
    const issues = detectShiftTimingIssues([supervisor, techA, techB], schedule);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ reason: "shift_coverage_partial", severity: "critical" });
    expect(issues[0].targetEvent).toBe(supervisor);
    expect(issues[0].missingIntervals).toEqual([{ startMinute: 660, endMinute: 720 }]);
  });

  it("13. full technician coverage -> no coverage issue", () => {
    const supervisor = supervisorShift();
    const tech = technicianShift();
    expect(detectShiftTimingIssues([supervisor, tech], schedule)).toEqual([]);
  });

  it("14. missing supervisor coverage for a technician target -> critical", () => {
    const tech = technicianShift();
    const issues = detectShiftTimingIssues([tech], schedule);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ reason: "shift_coverage_missing", severity: "critical" });
    expect(issues[0].targetEvent).toBe(tech);
  });

  it("15. shadow-only counterpart coverage remains missing -> critical", () => {
    const supervisor = supervisorShift();
    const shadowTech = technicianShift({ shadow: true });
    const issues = detectShiftTimingIssues([supervisor, shadowTech], schedule);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      reason: "shift_coverage_missing",
      severity: "critical",
      targetEvent: supervisor,
    });
  });

  it("16. invalid target shift time -> review invalid_shift_time", () => {
    const invalidShift = supervisorShift({ startTimeOverride: "99:99" });
    const issues = detectShiftTimingIssues([invalidShift], schedule);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ reason: "invalid_shift_time", severity: "review" });
    expect(issues[0].targetEvent).toBe(invalidShift);
  });

  it("17. an invalid target does NOT additionally emit a false missing-coverage issue", () => {
    const invalidShift = supervisorShift({ startTimeOverride: "99:99" });
    const issues = detectShiftTimingIssues([invalidShift], schedule);
    expect(issues).toHaveLength(1);
    expect(issues.some((issue) => issue.reason === "shift_coverage_missing")).toBe(false);
  });

  it("18. an unspecified-period shift does not create a guessed coverage issue", () => {
    const unspecified = supervisorShift({ period: "unspecified" });
    expect(detectShiftTimingIssues([unspecified], schedule)).toEqual([]);
  });

  it("never touches or rewrites the Event's rawValue", () => {
    const invalidShift = supervisorShift({ startTimeOverride: "99:99", rawValue: "אחמ\"ש יום מ-99:99" });
    detectShiftTimingIssues([invalidShift], schedule);
    expect(invalidShift.rawValue).toBe("אחמ\"ש יום מ-99:99");
  });

  it("2 supervisors + 0 technicians => valid, no missing-technician issue for either supervisor", () => {
    const martin = supervisorShift({ personId: "p_martin" });
    const ilay = supervisorShift({ personId: "p_ilay" });
    expect(detectShiftTimingIssues([martin, ilay], schedule)).toEqual([]);
  });

  it("1 supervisor + 0 technicians retains the existing missing-coverage behavior", () => {
    const martin = supervisorShift({ personId: "p_martin" });
    const issues = detectShiftTimingIssues([martin], schedule);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ reason: "shift_coverage_missing", targetEvent: martin });
  });

  it("the multi-supervisor waiver is never symmetric: 2 technicians + 0 supervisors still raises an issue for each", () => {
    const techA = technicianShift({ personId: "p_a" });
    const techB = technicianShift({ personId: "p_b" });
    const issues = detectShiftTimingIssues([techA, techB], schedule);
    expect(issues).toHaveLength(2);
    expect(issues.every((issue) => issue.reason === "shift_coverage_missing")).toBe(true);
  });
});

describe("detectCapabilityMismatchIssues — rule 4", () => {
  it("19. supervisor role with Person.isSupervisor = false -> review", () => {
    const event = supervisorShift({ personId: "p_1" });
    const people = new Map([["p_1", makePerson({ id: "p_1", isSupervisor: false, isTechnician: false })]]);
    const issues = detectCapabilityMismatchIssues([event], people);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ reason: "role_capability_mismatch", severity: "review" });
    expect(issues[0].metadata).toEqual({ requiredCapability: "isSupervisor" });
  });

  it("20. technician role with Person.isTechnician = false -> review", () => {
    const event = technicianShift({ personId: "p_1" });
    const people = new Map([["p_1", makePerson({ id: "p_1", isSupervisor: false, isTechnician: false })]]);
    const issues = detectCapabilityMismatchIssues([event], people);
    expect(issues).toHaveLength(1);
    expect(issues[0].metadata).toEqual({ requiredCapability: "isTechnician" });
  });

  it("21. matching capability -> no issue", () => {
    const supervisorEvent = supervisorShift({ personId: "p_1" });
    const techEvent = technicianShift({ personId: "p_2" });
    const people = new Map([
      ["p_1", makePerson({ id: "p_1", isSupervisor: true, isTechnician: false })],
      ["p_2", makePerson({ id: "p_2", isSupervisor: false, isTechnician: true })],
    ]);
    expect(detectCapabilityMismatchIssues([supervisorEvent, techEvent], people)).toEqual([]);
  });

  it("22. manager capability does not affect the role rule, in either direction", () => {
    const event = supervisorShift({ personId: "p_1" });

    const managerButNotSupervisor = new Map([
      ["p_1", makePerson({ id: "p_1", isManager: true, isSupervisor: false })],
    ]);
    expect(detectCapabilityMismatchIssues([event], managerButNotSupervisor)).toHaveLength(1);

    const supervisorButNotManager = new Map([
      ["p_1", makePerson({ id: "p_1", isManager: false, isSupervisor: true })],
    ]);
    expect(detectCapabilityMismatchIssues([event], supervisorButNotManager)).toEqual([]);
  });

  it("does not throw and produces no issue when there is no personnel record for the person", () => {
    const event = supervisorShift({ personId: "p_unknown" });
    expect(() => detectCapabilityMismatchIssues([event], new Map())).not.toThrow();
    expect(detectCapabilityMismatchIssues([event], new Map())).toEqual([]);
  });
});

function qualificationMap(entries: Record<string, WeaponQualificationInfo>): Map<string, WeaponQualificationInfo> {
  return new Map(Object.entries(entries));
}

describe("detectWeaponQualificationIssues — rule 5", () => {
  it("expired qualification + oxid tomorrow -> issue", () => {
    const event = dutyEvent({ personId: "p_1", dutyFamily: "oxid", date: "2026-08-31" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2026-08-23", notRelevant: false } });
    const issues = detectWeaponQualificationIssues([event], qualification);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ reason: "weapon_qualification_invalid", severity: "critical", personId: "p_1", date: "2026-08-31" });
    expect(issues[0].targetEvent).toBe(event);
  });

  it("expired qualification + guard duty (שמירות) -> issue", () => {
    const event = dutyEvent({ personId: "p_1", dutyFamily: "guard", date: "2026-08-31" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2026-08-23", notRelevant: false } });
    expect(detectWeaponQualificationIssues([event], qualification)).toHaveLength(1);
  });

  it("expired qualification + reserve duty (עתודה) -> issue", () => {
    const event = dutyEvent({ personId: "p_1", dutyFamily: "reserve", date: "2026-08-31" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2026-08-23", notRelevant: false } });
    expect(detectWeaponQualificationIssues([event], qualification)).toHaveLength(1);
  });

  it("qualification expires BEFORE the activity date -> issue", () => {
    const event = dutyEvent({ personId: "p_1", dutyFamily: "oxid", date: "2026-03-01" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2026-02-28", notRelevant: false } });
    expect(detectWeaponQualificationIssues([event], qualification)).toHaveLength(1);
  });

  it("qualification expires ON the activity date -> no issue (valid through the end of the expiry day)", () => {
    const event = dutyEvent({ personId: "p_1", dutyFamily: "oxid", date: "2026-03-01" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2026-03-01", notRelevant: false } });
    expect(detectWeaponQualificationIssues([event], qualification)).toEqual([]);
  });

  it("qualification remains valid through the activity date -> no issue", () => {
    const event = dutyEvent({ personId: "p_1", dutyFamily: "oxid", date: "2026-03-01" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2026-06-01", notRelevant: false } });
    expect(detectWeaponQualificationIssues([event], qualification)).toEqual([]);
  });

  it("no recorded valid qualification (expiryDate: null) -> issue", () => {
    const event = dutyEvent({ personId: "p_1", dutyFamily: "oxid", date: "2026-03-01" });
    const qualification = qualificationMap({ p_1: { expiryDate: null, notRelevant: false } });
    expect(detectWeaponQualificationIssues([event], qualification)).toHaveLength(1);
  });

  it("unrelated activity (a plain shift, no dutyFamily) -> no issue", () => {
    const event = technicianShift({ personId: "p_1" });
    const qualification = qualificationMap({ p_1: { expiryDate: null, notRelevant: false } });
    expect(detectWeaponQualificationIssues([event], qualification)).toEqual([]);
  });

  it("a duty family that does not require a weapon (e.g. rasar) -> no issue even with an expired qualification", () => {
    const event = dutyEvent({ personId: "p_1", dutyFamily: "rasar", date: "2026-03-01" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2026-01-01", notRelevant: false } });
    expect(detectWeaponQualificationIssues([event], qualification)).toEqual([]);
  });

  it("an explicit לא רלוונטי override always wins, regardless of expiry -> no issue", () => {
    const event = dutyEvent({ personId: "p_1", dutyFamily: "oxid", date: "2026-03-01" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2020-01-01", notRelevant: true } });
    expect(detectWeaponQualificationIssues([event], qualification)).toEqual([]);
  });

  it("a person entirely absent from the map (out of scope) -> no issue, never a 'missing data' fabrication", () => {
    const event = dutyEvent({ personId: "p_unknown", dutyFamily: "oxid", date: "2026-03-01" });
    expect(detectWeaponQualificationIssues([event], new Map())).toEqual([]);
  });

  it("activity in the future: qualification valid TODAY but expires before the activity date -> issue (checked against the activity date, never 'today')", () => {
    // Baseline expires 2026-02-01; the activity itself is scheduled for
    // 2026-03-01, well after expiry -- even though, evaluated against an
    // earlier "today", the same baseline would still read as valid.
    const event = dutyEvent({ personId: "p_1", dutyFamily: "oxid", date: "2026-03-01" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2026-02-01", notRelevant: false } });
    expect(detectWeaponQualificationIssues([event], qualification)).toHaveLength(1);
  });

  it("a future activity where the qualification stays valid through that date -> no issue", () => {
    const event = dutyEvent({ personId: "p_1", dutyFamily: "oxid", date: "2026-03-01" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2026-04-01", notRelevant: false } });
    expect(detectWeaponQualificationIssues([event], qualification)).toEqual([]);
  });
});

describe("detectOperationalIssues — integration", () => {
  it("10. multiple events on a clean day produce no issues at all", () => {
    const supervisor = supervisorShift({ personId: "p_sup" });
    const tech = technicianShift({ personId: "p_tech" });
    const duty = dutyEvent({ personId: "p_tech" });
    const status = statusEvent({ personId: "p_sup" });
    const people = [
      makePerson({ id: "p_sup", isSupervisor: true, isTechnician: false }),
      makePerson({ id: "p_tech", isSupervisor: false, isTechnician: true }),
    ];
    const issues = detectOperationalIssues([supervisor, tech, duty, status], people, schedule);
    expect(issues).toEqual([]);
  });

  it("23. tentative Event metadata remains untouched inside a reported issue", () => {
    const tentativeSupervisor = supervisorShift({ certainty: "tentative" });
    const issues = detectOperationalIssues([tentativeSupervisor], [], schedule);
    const missingCoverageIssue = issues.find((issue) => issue.reason === "shift_coverage_missing");
    expect(missingCoverageIssue?.targetEvent?.certainty).toBe("tentative");
  });

  it("24. source evidence remains intact (same Event references, correct sourceSheet/sourceCell)", () => {
    const supervisor = supervisorShift({ sourceCell: "F9", sourceSheet: "משמרות + תורנויות" });
    const issues = detectOperationalIssues([supervisor], [], schedule);
    const issue = issues.find((i) => i.reason === "shift_coverage_missing");
    expect(issue?.events).toContain(supervisor);
    expect(issue?.targetEvent?.sourceCell).toBe("F9");
  });

  it("25. an unknown/free-text Event alone creates no issue", () => {
    expect(detectOperationalIssues([otherEvent()], [], schedule)).toEqual([]);
  });

  it("26. a change_note Event alone creates no issue", () => {
    expect(detectOperationalIssues([changeNoteEvent()], [], schedule)).toEqual([]);
  });

  it("27. rules do not mutate Events or People passed in", () => {
    const absence = Object.freeze(absenceEvent("vacation"));
    const shift = Object.freeze(technicianShift());
    const person = Object.freeze(makePerson());
    expect(() => detectOperationalIssues([absence, shift], [person], schedule)).not.toThrow();
    expect(absence.absenceKind).toBe("vacation");
    expect(shift.role).toBe("technician");
    expect(person.isTechnician).toBe(true);
  });

  it("28. a duplicate input reference does not create a duplicate identical issue", () => {
    const invalidShift = supervisorShift({ startTimeOverride: "99:99" });
    const issues = detectOperationalIssues([invalidShift, invalidShift], [], schedule);
    expect(issues.filter((issue) => issue.reason === "invalid_shift_time")).toHaveLength(1);
  });

  it("28b. duplicating a blocking-absence pair does not create a duplicate issue", () => {
    const absence = absenceEvent("vacation");
    const shift = technicianShift();
    const issues = detectOperationalIssues([absence, shift, absence, shift], [], schedule);
    expect(issues.filter((issue) => issue.reason === "blocking_absence_with_assignment")).toHaveLength(1);
  });

  it("29. two genuinely different affected Events remain distinguishable, not collapsed", () => {
    const shiftA = supervisorShift({ startTimeOverride: "99:99", sourceCell: "C2" });
    const shiftB = supervisorShift({ startTimeOverride: "25:00", sourceCell: "D2", date: "2026-01-06" });
    const issues = detectOperationalIssues([shiftA, shiftB], [], schedule);
    const invalidIssues = issues.filter((issue) => issue.reason === "invalid_shift_time");
    expect(invalidIssues).toHaveLength(2);
    expect(invalidIssues.map((issue) => issue.targetEvent)).toEqual(
      expect.arrayContaining([shiftA, shiftB]),
    );
  });

  it("does not put presentation strings in the domain result (no Hebrew UI copy on the issue itself)", () => {
    const issues = detectOperationalIssues([supervisorShift()], [], schedule);
    for (const issue of issues) {
      expect(typeof issue.reason).toBe("string");
      expect(issue.reason).toMatch(/^[a-z_]+$/);
    }
  });

  it("30. detectOperationalIssues wires the qualification map through to the weapon-qualification rule (default: no map, no issue)", () => {
    const duty = dutyEvent({ personId: "p_1", dutyFamily: "oxid", date: "2026-08-31" });
    expect(detectOperationalIssues([duty], [], schedule)).toEqual([]);

    const qualification = qualificationMap({ p_1: { expiryDate: "2026-08-23", notRelevant: false } });
    const issues = detectOperationalIssues([duty], [], schedule, qualification);
    expect(issues.filter((issue) => issue.reason === "weapon_qualification_invalid")).toHaveLength(1);
  });

  it("31. repeated/duplicate processing of the same weapon-qualification evidence produces one logical issue, not duplicates", () => {
    const duty = dutyEvent({ personId: "p_1", dutyFamily: "oxid", date: "2026-08-31" });
    const qualification = qualificationMap({ p_1: { expiryDate: "2026-08-23", notRelevant: false } });
    const issues = detectOperationalIssues([duty, duty], [], schedule, qualification);
    expect(issues.filter((issue) => issue.reason === "weapon_qualification_invalid")).toHaveLength(1);
  });
});
