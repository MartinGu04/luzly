import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/domain/event";
import type { PotentialAllocation } from "@/lib/domain/potentialAllocation";
import { reconcilePotentialAllocations } from "@/lib/domain/potentialReconciliation";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import type { LocalNow } from "@/lib/domain/localNow";
import { buildPersonalScheduleReadModel } from "./buildPersonalScheduleReadModel";

/**
 * Real-world regression: a person's actual internal schedule had a
 * "מטבח יומי" (daily_kitchen) duty, while the Potential/תקשא"ס source
 * separately required a "מטבח מלא 3" (full_kitchen, Potential column/
 * `sourceSlot` 3 -- kitchen families never carry a numbered internal
 * `slot`, only guard/reserve do) for the same date -- a genuinely
 * DIFFERENT duty family. The personal calendar used to
 * show BOTH (the real duty, plus a synthetic tentative "מטבח מלא 3" duty
 * built from the mismatched Potential allocation), even though Potential
 * is only organizational/source planning data, never a second confirmed
 * schedule entry -- misleadingly looking like two duties.
 *
 * This test drives the SAME real-shaped fixture through BOTH the personal
 * read-model boundary (`buildPersonalScheduleReadModel`) and the
 * completely separate manager-facing reconciliation boundary
 * (`reconcilePotentialAllocations`), proving the fix is scoped to
 * personal PRESENTATION only: the personal calendar now shows just the
 * real duty, while a manager can still see the Potential requirement is
 * genuinely unmet.
 */
describe("Potential/תקשא\"ס allocations stay out of the personal calendar while manager reconciliation is unaffected (regression)", () => {
  const schedule = buildShiftSchedule("07:30");

  function syntheticPerson(name: string): Person {
    return {
      id: `id_${name}`,
      name,
      email: null,
      isManager: false,
      isTechnician: true,
      isSupervisor: false,
      personnelType: null,
    };
  }

  const PERSON = syntheticPerson("שירה בדיקה");
  const people = [PERSON];

  const realDailyKitchenDuty: Event = {
    personId: PERSON.id,
    personName: PERSON.name,
    date: "2026-08-20",
    title: "מטבח יומי",
    rawValue: "מטבח יומי",
    category: "duty",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: "C1",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: "daily_kitchen",
    absenceKind: null,
  };

  // full_kitchen (like all kitchen/rasar/oxid families) never carries a
  // numbered internal `slot` -- only guard/reserve do. The Potential
  // column order lives in `sourceSlot` alone, per `lib/parsers/potential.ts`.
  const mismatchedFullKitchenAllocation: PotentialAllocation = {
    date: "2026-08-20",
    dutyFamily: "full_kitchen",
    slot: null,
    sourceSlot: 3,
    columnLabel: "מטבח מלא 3",
    sourceAllocationLabel: PERSON.name,
    resolvedSourcePersonId: PERSON.id,
    sourceSheet: 'פוטנציאל תקש"אס 7-12/2026',
    sourceCell: "D1",
  };

  it("the personal calendar shows ONLY the real מטבח יומי duty, never a second מטבח מלא 3 pseudo-duty", () => {
    const model = buildPersonalScheduleReadModel({
      person: PERSON,
      people,
      events: [realDailyKitchenDuty],
      shiftSchedule: schedule,
      fetchedAt: "2026-08-13T08:00:00.000Z",
      now: { date: "2026-08-13", minuteOfDay: 600 } satisfies LocalNow,
      potentialAllocations: [mismatchedFullKitchenAllocation],
    });

    const dutyEvents = model.calendarEvents.filter((event) => event.category === "duty");
    expect(dutyEvents).toEqual([expect.objectContaining({ dutyFamily: "daily_kitchen", title: "מטבח יומי" })]);
    expect(model.calendarEvents.some((event) => event.dutyFamily === "full_kitchen")).toBe(false);

    // Same real duty stays visible in every personal-facing surface, and
    // never as a duplicate -- nextAssignmentGroup carries only the real
    // future duty, never the mismatched Potential allocation too.
    expect(model.dutyBlocks).toEqual([expect.objectContaining({ dutyFamily: "daily_kitchen" })]);
    expect(model.nextAssignmentGroup?.events).toEqual([expect.objectContaining({ dutyFamily: "daily_kitchen" })]);
  });

  it("the SAME allocation still reaches manager reconciliation and is correctly reported 'missing' -- the family mismatch is genuinely unmet", () => {
    const reconciliations = reconcilePotentialAllocations([mismatchedFullKitchenAllocation], [realDailyKitchenDuty]);
    expect(reconciliations).toEqual([
      expect.objectContaining({ dutyFamily: "full_kitchen", status: "missing", actualAssignees: [] }),
    ]);
  });

  it("a Potential requirement that GENUINELY matches an internal duty (same family/slot) is reported 'covered' -- reconciliation logic itself is untouched", () => {
    const matchingFullKitchenDuty: Event = {
      ...realDailyKitchenDuty,
      title: "מטבח מלא 3",
      rawValue: "מטבח מלא 3",
      dutyFamily: "full_kitchen",
    };
    const reconciliations = reconcilePotentialAllocations([mismatchedFullKitchenAllocation], [matchingFullKitchenDuty]);
    expect(reconciliations).toEqual([
      expect.objectContaining({
        dutyFamily: "full_kitchen",
        status: "covered",
        actualAssignees: [expect.objectContaining({ personId: PERSON.id })],
      }),
    ]);

    // And the personal calendar correctly shows that same real duty too --
    // a genuine match was never at risk of being hidden by this fix.
    const model = buildPersonalScheduleReadModel({
      person: PERSON,
      people,
      events: [matchingFullKitchenDuty],
      shiftSchedule: schedule,
      fetchedAt: "2026-08-13T08:00:00.000Z",
      now: { date: "2026-08-13", minuteOfDay: 600 } satisfies LocalNow,
      potentialAllocations: [mismatchedFullKitchenAllocation],
    });
    expect(model.calendarEvents.filter((event) => event.category === "duty")).toEqual([
      expect.objectContaining({ dutyFamily: "full_kitchen", title: "מטבח מלא 3" }),
    ]);
  });

  it("Potential remains a gap-filler: a DIFFERENT date with no real internal duty at all still gets the Potential allocation as a tentative personal duty", () => {
    const gapFillerAllocation: PotentialAllocation = {
      ...mismatchedFullKitchenAllocation,
      date: "2026-08-25",
      sourceCell: "D2",
    };
    const model = buildPersonalScheduleReadModel({
      person: PERSON,
      people,
      events: [realDailyKitchenDuty], // only on 2026-08-20 -- 2026-08-25 has no real duty at all.
      shiftSchedule: schedule,
      fetchedAt: "2026-08-13T08:00:00.000Z",
      now: { date: "2026-08-13", minuteOfDay: 600 } satisfies LocalNow,
      potentialAllocations: [gapFillerAllocation],
    });
    const dutyEvents = model.calendarEvents.filter((event) => event.category === "duty");
    expect(dutyEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-08-20", dutyFamily: "daily_kitchen", certainty: "confirmed" }),
        expect.objectContaining({ date: "2026-08-25", dutyFamily: "full_kitchen", certainty: "tentative" }),
      ]),
    );
    expect(dutyEvents).toHaveLength(2);
  });

  it("a PR #76 personal activity (status/other) on the same date is unaffected by this fix -- still reaches the personal calendar", () => {
    const statusActivity: Event = {
      ...realDailyKitchenDuty,
      title: "סוגר",
      rawValue: "סוגר",
      category: "status",
      dutyFamily: null,
    };
    const model = buildPersonalScheduleReadModel({
      person: PERSON,
      people,
      events: [realDailyKitchenDuty, statusActivity],
      shiftSchedule: schedule,
      fetchedAt: "2026-08-13T08:00:00.000Z",
      now: { date: "2026-08-13", minuteOfDay: 600 } satisfies LocalNow,
      potentialAllocations: [mismatchedFullKitchenAllocation],
    });
    expect(model.calendarEvents.some((event) => event.category === "status" && event.title === "סוגר")).toBe(true);
    expect(model.calendarEvents.filter((event) => event.category === "duty")).toHaveLength(1);
  });
});

/**
 * Production-shaped source-precedence regression (synthetic names,
 * standing in for the real איתי/שירלי swap): Potential still names Itay
 * for guard slot 4 starting Sunday 06/09/2026, but a real internal SWAP
 * later moved his actual guard-4 duty to Tue-Thu 08-10/09/2026 -- the SAME
 * Sunday-Saturday calendar week. Before this fix,
 * `buildPotentialDutyEvents` only ever suppressed a Potential allocation
 * when a real duty existed at the EXACT same date -- so the stale 06/09
 * entry survived as a phantom extra tentative duty even though the person's
 * real guard-4 duty had simply moved a few days later within the same
 * week. `isAlreadyCoveredByInternalDuty` now reconciles guard/reserve
 * (`EXACT_SLOT_FAMILIES`) by week, not just exact date, since the numbered
 * slot represents ONE continuous requirement across its week.
 */
describe("Potential never surfaces a stale same-week guard/reserve entry once the real internal duty was swapped within that week (source-precedence regression)", () => {
  const schedule = buildShiftSchedule("07:30");

  function syntheticPerson(name: string): Person {
    return {
      id: `id_${name}`,
      name,
      email: null,
      isManager: false,
      isTechnician: true,
      isSupervisor: false,
      personnelType: null,
    };
  }

  const ITAY = syntheticPerson("איתן בדיקה");
  const people = [ITAY];

  function guardAllocation(overrides: Partial<PotentialAllocation> = {}): PotentialAllocation {
    return {
      date: "2026-09-06",
      dutyFamily: "guard",
      slot: 4,
      sourceSlot: 4,
      columnLabel: "שומר 4",
      sourceAllocationLabel: ITAY.name,
      resolvedSourcePersonId: ITAY.id,
      sourceSheet: 'פוטנציאל תקש"אס 7-12/2026',
      sourceCell: "D1",
      ...overrides,
    };
  }

  function realGuardDuty(date: string, sourceCell: string): Event {
    return {
      personId: ITAY.id,
      personName: ITAY.name,
      date,
      title: "שומר 4",
      rawValue: "שומר 4",
      category: "duty",
      certainty: "confirmed",
      role: null,
      period: "unspecified",
      sourceSheet: "משמרות + תורנויות",
      sourceCell,
      slot: 4,
      shadow: false,
      startTimeOverride: null,
      endTimeOverride: null,
      changeNote: null,
      dutyFamily: "guard",
      absenceKind: null,
    };
  }

  it("06/09 vs 08-10/09: the stale Potential entry on the swap's ORIGINAL date never surfaces once the real duty moved within the same week", () => {
    const realDuty = [
      realGuardDuty("2026-09-08", "C1"),
      realGuardDuty("2026-09-09", "C2"),
      realGuardDuty("2026-09-10", "C3"),
    ];
    const model = buildPersonalScheduleReadModel({
      person: ITAY,
      people,
      events: realDuty,
      shiftSchedule: schedule,
      fetchedAt: "2026-09-01T08:00:00.000Z",
      now: { date: "2026-09-01", minuteOfDay: 600 } satisfies LocalNow,
      potentialAllocations: [guardAllocation({ date: "2026-09-06" })],
    });

    const dutyEvents = model.calendarEvents.filter((event) => event.category === "duty");
    expect(dutyEvents).toEqual([
      expect.objectContaining({ date: "2026-09-08", dutyFamily: "guard", certainty: "confirmed" }),
      expect.objectContaining({ date: "2026-09-09", dutyFamily: "guard", certainty: "confirmed" }),
      expect.objectContaining({ date: "2026-09-10", dutyFamily: "guard", certainty: "confirmed" }),
    ]);
    expect(dutyEvents.some((event) => event.date === "2026-09-06")).toBe(false);
  });

  it("anti-regression: with NO real guard-4 duty anywhere that week, the same Potential entry still fills the genuine gap as a tentative duty", () => {
    const model = buildPersonalScheduleReadModel({
      person: ITAY,
      people,
      events: [],
      shiftSchedule: schedule,
      fetchedAt: "2026-09-01T08:00:00.000Z",
      now: { date: "2026-09-01", minuteOfDay: 600 } satisfies LocalNow,
      potentialAllocations: [guardAllocation({ date: "2026-09-06" })],
    });

    const dutyEvents = model.calendarEvents.filter((event) => event.category === "duty");
    expect(dutyEvents).toEqual([
      expect.objectContaining({ date: "2026-09-06", dutyFamily: "guard", certainty: "tentative" }),
    ]);
  });

  it("anti-regression: a real guard-4 duty in a DIFFERENT week never suppresses a genuinely separate Potential requirement", () => {
    const model = buildPersonalScheduleReadModel({
      person: ITAY,
      people,
      events: [realGuardDuty("2026-08-30", "C1")], // the week before -- a different, already-completed requirement
      shiftSchedule: schedule,
      fetchedAt: "2026-09-01T08:00:00.000Z",
      now: { date: "2026-09-01", minuteOfDay: 600 } satisfies LocalNow,
      potentialAllocations: [guardAllocation({ date: "2026-09-06" })],
    });

    const dutyEvents = model.calendarEvents.filter((event) => event.category === "duty");
    expect(dutyEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-08-30", dutyFamily: "guard", certainty: "confirmed" }),
        expect.objectContaining({ date: "2026-09-06", dutyFamily: "guard", certainty: "tentative" }),
      ]),
    );
    expect(dutyEvents).toHaveLength(2);
  });

  it("same-date exact dedup remains correct: a real duty on the EXACT same date as the Potential entry is still deduped as before", () => {
    const model = buildPersonalScheduleReadModel({
      person: ITAY,
      people,
      events: [realGuardDuty("2026-09-06", "C1")],
      shiftSchedule: schedule,
      fetchedAt: "2026-09-01T08:00:00.000Z",
      now: { date: "2026-09-01", minuteOfDay: 600 } satisfies LocalNow,
      potentialAllocations: [guardAllocation({ date: "2026-09-06" })],
    });

    const dutyEvents = model.calendarEvents.filter((event) => event.category === "duty");
    expect(dutyEvents).toEqual([
      expect.objectContaining({ date: "2026-09-06", dutyFamily: "guard", certainty: "confirmed" }),
    ]);
  });

  it("multiplicity anti-regression: TWO same-week Potential guard-4 entries (first-half + second-half, as the real workbook actually structures them) with only ONE confirmed block -- exactly one is suppressed, the genuinely still-open other one stays tentative on the personal calendar", () => {
    // 06/09 and 09/09 are both in the SAME week as the earlier tests, but
    // here BOTH are separate Potential requirements (unlike the swap
    // scenario above, which has just one). Only the second-half (09/09) has
    // a real confirmed duty; the first-half (06/09) genuinely has none yet.
    const model = buildPersonalScheduleReadModel({
      person: ITAY,
      people,
      events: [realGuardDuty("2026-09-09", "C1")],
      shiftSchedule: schedule,
      fetchedAt: "2026-09-01T08:00:00.000Z",
      now: { date: "2026-09-01", minuteOfDay: 600 } satisfies LocalNow,
      potentialAllocations: [
        guardAllocation({ date: "2026-09-06", sourceCell: "D1" }),
        guardAllocation({ date: "2026-09-09", sourceCell: "D2" }),
      ],
    });

    const dutyEvents = model.calendarEvents.filter((event) => event.category === "duty");
    expect(dutyEvents).toEqual([
      expect.objectContaining({ date: "2026-09-06", dutyFamily: "guard", certainty: "tentative" }),
      expect.objectContaining({ date: "2026-09-09", dutyFamily: "guard", certainty: "confirmed" }),
    ]);
    // Never both suppressed, and never the confirmed duty duplicated by a
    // second, redundant tentative entry on its own exact date.
    expect(dutyEvents).toHaveLength(2);
  });
});
