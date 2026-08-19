import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import { resolveShiftSnapshotTriad } from "./shiftSnapshot";

// day 07:30-19:30, night 19:30-07:30(+1)
const schedule = buildShiftSchedule("07:30");

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function shiftEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p_tech",
    personName: "טכנאי בדיקה",
    date: "2026-08-12",
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

function localNow(overrides: Partial<LocalNow> = {}): LocalNow {
  return { date: "2026-08-12", minuteOfDay: 8 * 60, ...overrides };
}

describe("resolveShiftSnapshotTriad — chronological selection", () => {
  it("mid-day-shift: previous is last night, current is today's day shift, next is tonight", () => {
    const triad = resolveShiftSnapshotTriad([], schedule, localNow({ minuteOfDay: 8 * 60 }));

    expect(triad.previousShift).toEqual(expect.objectContaining({ date: "2026-08-11", period: "night" }));
    expect(triad.currentShift).toEqual(expect.objectContaining({ date: "2026-08-12", period: "day" }));
    expect(triad.nextShift).toEqual(expect.objectContaining({ date: "2026-08-12", period: "night" }));
  });

  it("crosses midnight: shortly after midnight, current is still yesterday's night shift", () => {
    const triad = resolveShiftSnapshotTriad([], schedule, localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 }));

    expect(triad.currentShift).toEqual(expect.objectContaining({ date: "2026-08-11", period: "night" }));
    expect(triad.previousShift).toEqual(expect.objectContaining({ date: "2026-08-11", period: "day" }));
    expect(triad.nextShift).toEqual(expect.objectContaining({ date: "2026-08-12", period: "day" }));
  });

  it("always resolves department-wide neighboring shifts, never filtered to a single person's assignments", () => {
    const events = [
      shiftEvent({ personId: "p_tech", personName: "טכנאי בדיקה", role: "technician", period: "day" }),
      shiftEvent({ personId: "p_other", personName: "טכנאי אחר", role: "technician", period: "night", date: "2026-08-12" }),
    ];
    const triad = resolveShiftSnapshotTriad(events, schedule, localNow({ minuteOfDay: 8 * 60 }));

    // The current (day) shift roster includes the day technician regardless of who is "logged in".
    expect(triad.currentShift.technicians.map((p) => p.personName)).toEqual(["טכנאי בדיקה"]);
    // The next (tonight) shift roster is resolved too, independent of the viewer.
    expect(triad.nextShift.technicians.map((p) => p.personName)).toEqual(["טכנאי אחר"]);
  });
});

describe("resolveShiftSnapshotTriad — progress", () => {
  it("computes elapsed/remaining/duration for the currently active shift", () => {
    const triad = resolveShiftSnapshotTriad([], schedule, localNow({ minuteOfDay: 8 * 60 })); // 30 min into 07:30 day shift

    expect(triad.currentShift.timing.status).toBe("resolved");
    expect(triad.currentShift.timing.elapsedMinutesAtLoad).toBe(30);
    expect(triad.currentShift.timing.durationMinutes).toBe(720);
    expect(triad.currentShift.timing.remainingMinutesAtLoad).toBe(690);
  });

  it("overnight shift crossing a date boundary still resolves correct elapsed/remaining", () => {
    // 02:00 on 2026-08-12 is 6.5h into the night shift that started 19:30 on 2026-08-11.
    const triad = resolveShiftSnapshotTriad([], schedule, localNow({ date: "2026-08-12", minuteOfDay: 2 * 60 }));

    expect(triad.currentShift.date).toBe("2026-08-11");
    expect(triad.currentShift.period).toBe("night");
    expect(triad.currentShift.timing.status).toBe("resolved");
    expect(triad.currentShift.timing.elapsedMinutesAtLoad).toBe(6.5 * 60);
    expect(triad.currentShift.timing.durationMinutes).toBe(720);
    expect(triad.currentShift.timing.remainingMinutesAtLoad).toBe(5.5 * 60);
  });

  it("previous/next shifts also carry resolved timing (not just the current one)", () => {
    const triad = resolveShiftSnapshotTriad([], schedule, localNow({ minuteOfDay: 8 * 60 }));

    expect(triad.previousShift.startLocalTime).toBe("19:30");
    expect(triad.previousShift.endLocalTime).toBe("07:30");
    expect(triad.nextShift.startLocalTime).toBe("19:30");
    expect(triad.nextShift.endLocalTime).toBe("07:30");
  });
});

describe("resolveShiftSnapshotTriad — staffing + coverage", () => {
  it("partially staffed: a technician alone leaves the supervisor role missing on the current shift", () => {
    const events = [shiftEvent({ personId: "p_tech", role: "technician", period: "day" })];
    const triad = resolveShiftSnapshotTriad(events, schedule, localNow());

    expect(triad.currentShift.coverageStatus).toBe("missing");
    expect(triad.currentShift.roleCoverage.supervisor.status).toBe("missing");
    expect(triad.currentShift.roleCoverage.technician.status).toBe("full");
  });

  it("empty shift: nobody assigned anywhere in the triad is reported as missing, never omitted", () => {
    const triad = resolveShiftSnapshotTriad([], schedule, localNow());

    expect(triad.previousShift.coverageStatus).toBe("missing");
    expect(triad.currentShift.coverageStatus).toBe("missing");
    expect(triad.nextShift.coverageStatus).toBe("missing");
    expect(triad.previousShift.technicians).toEqual([]);
    expect(triad.currentShift.supervisors).toEqual([]);
    expect(triad.nextShift.technicians).toEqual([]);
  });

  it("a shift with no events at all (missing previous/next schedule data) still resolves a well-formed missing shift, not a crash", () => {
    // Only the current shift has any events; previous/next have none in the source data.
    const events = [
      shiftEvent({ personId: "p_tech", role: "technician", period: "day" }),
      shiftEvent({ personId: "p_sup", personName: "אחמש בדיקה", role: "supervisor", period: "day" }),
    ];
    const triad = resolveShiftSnapshotTriad(events, schedule, localNow());

    expect(triad.currentShift.coverageStatus).toBe("full");
    expect(triad.previousShift.coverageStatus).toBe("missing");
    expect(triad.previousShift.missingIntervals.length).toBeGreaterThan(0);
    expect(triad.nextShift.coverageStatus).toBe("missing");
  });
});
