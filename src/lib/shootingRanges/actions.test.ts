import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";

const resolveCurrentPerson = vi.fn();
const loadManagerPersonnelContext = vi.fn();
const insertSelfReport = vi.fn();
const createPlannedOccurrences = vi.fn();
const getPlannedOccurrencesByDate = vi.fn();
const confirmShootingRangeOccurrences = vi.fn();
const resolveSelfReport = vi.fn();
const notifyPeopleScheduledForRange = vi.fn();
const scheduleManagerConfirmationRequiredJob = vi.fn();
const cancelManagerConfirmationRequiredJob = vi.fn();
const notifySelfReportDecision = vi.fn();

vi.mock("@/lib/auth/resolveCurrentPerson", () => ({ resolveCurrentPerson }));
vi.mock("@/lib/readModels/managerWorkbookContext", () => ({ loadManagerPersonnelContext }));
vi.mock("./store", () => ({
  insertSelfReport,
  createPlannedOccurrences,
  getPlannedOccurrencesByDate,
  confirmShootingRangeOccurrences,
  resolveSelfReport,
}));
vi.mock("@/lib/notifications/engine/shootingRanges", () => ({
  notifyPeopleScheduledForRange,
  scheduleManagerConfirmationRequiredJob,
  cancelManagerConfirmationRequiredJob,
  notifySelfReportDecision,
}));

const {
  submitSelfReportShootingRangeAction,
  createPlannedShootingRangeAction,
} = await import("./actions");

// Regular-service (חובה) + טכנאי by default -- מטווחים is scoped to
// regular personnel who are also אחמ"ש/טכנאי.
function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "דני בדיקה",
    email: "dani@example.invalid",
    isManager: false,
    isTechnician: true,
    isSupervisor: false,
    personnelType: "חובה",
    ...overrides,
  };
}

const MANAGER = person({ id: "mgr1", name: "מנהל בדיקה", isManager: true });

describe("submitSelfReportShootingRangeAction -- eligibility (regular-service AND אחמ\"ש/טכנאי)", () => {
  beforeEach(() => {
    resolveCurrentPerson.mockReset();
    insertSelfReport.mockReset();
    insertSelfReport.mockResolvedValue({});
  });

  it("allows a regular (חובה) person to submit a self-report", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "ok", person: person({ personnelType: "חובה" }) });

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: true });
    expect(insertSelfReport).toHaveBeenCalledTimes(1);
  });

  it("rejects a permanent (קבע) person -- never trusts the client, never inserts a report", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "ok", person: person({ personnelType: "קבע" }) });

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: false, error: "not_eligible" });
    expect(insertSelfReport).not.toHaveBeenCalled();
  });

  it("rejects a reserve (מילואים) person", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "ok", person: person({ personnelType: "מילואים" }) });

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: false, error: "not_eligible" });
    expect(insertSelfReport).not.toHaveBeenCalled();
  });

  it("rejects an unclassified/missing personnel type -- fails closed, never assumed eligible", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "ok", person: person({ personnelType: null }) });

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: false, error: "not_eligible" });
  });

  it("rejects a regular (חובה) person who is neither אחמ\"ש nor טכנאי", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "ok", person: person({ isTechnician: false, isSupervisor: false }) });

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: false, error: "not_eligible" });
    expect(insertSelfReport).not.toHaveBeenCalled();
  });

  it("allows a regular (חובה) אחמ\"ש even without the טכנאי flag", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "ok", person: person({ isTechnician: false, isSupervisor: true }) });

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: true });
  });
});

describe("createPlannedShootingRangeAction -- eligibility (regular-service AND אחמ\"ש/טכנאי)", () => {
  beforeEach(() => {
    loadManagerPersonnelContext.mockReset();
    createPlannedOccurrences.mockReset();
    notifyPeopleScheduledForRange.mockReset();
    scheduleManagerConfirmationRequiredJob.mockReset();
    createPlannedOccurrences.mockResolvedValue([{ id: "o1", rangeDate: "2026-09-03", personId: "p_regular", status: "planned", createdByPersonId: "mgr1", createdByPersonName: "מנהל בדיקה", resolvedByPersonId: null, resolvedByPersonName: null, resolvedAt: null, createdAt: "2026-08-25T00:00:00.000Z" }]);
  });

  it("drops permanent/reserve/foreign ids from the scheduled set -- only genuinely regular roster ids ever reach createPlannedOccurrences or the notifications", async () => {
    const regular = person({ id: "p_regular", personnelType: "חובה" });
    const permanent = person({ id: "p_permanent", personnelType: "קבע" });
    const reserve = person({ id: "p_reserve", personnelType: "מילואים" });
    loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [regular, permanent, reserve] } });

    const result = await createPlannedShootingRangeAction("2026-09-03", ["p_regular", "p_permanent", "p_reserve", "not-in-roster"]);

    expect(result).toEqual({ ok: true, scheduledCount: 1 });
    expect(createPlannedOccurrences).toHaveBeenCalledWith("2026-09-03", ["p_regular"], "mgr1", "מנהל בדיקה");
    expect(notifyPeopleScheduledForRange).toHaveBeenCalledWith([regular, permanent, reserve], ["p_regular"], "2026-09-03");
  });

  it("drops a regular person who is neither אחמ\"ש nor טכנאי from the scheduled set", async () => {
    const eligible = person({ id: "p_eligible" });
    const regularOther = person({ id: "p_other", isTechnician: false, isSupervisor: false });
    loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [eligible, regularOther] } });

    const result = await createPlannedShootingRangeAction("2026-09-03", ["p_eligible", "p_other"]);

    expect(result).toEqual({ ok: true, scheduledCount: 1 });
    expect(createPlannedOccurrences).toHaveBeenCalledWith("2026-09-03", ["p_eligible"], "mgr1", "מנהל בדיקה");
  });

  it("fails with invalid_targets when EVERY submitted id is non-regular -- never silently schedules nobody as a false success", async () => {
    const permanent = person({ id: "p_permanent", personnelType: "קבע" });
    const reserve = person({ id: "p_reserve", personnelType: "מילואים" });
    loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [permanent, reserve] } });

    const result = await createPlannedShootingRangeAction("2026-09-03", ["p_permanent", "p_reserve"]);

    expect(result).toEqual({ ok: false, error: "invalid_targets" });
    expect(createPlannedOccurrences).not.toHaveBeenCalled();
    expect(notifyPeopleScheduledForRange).not.toHaveBeenCalled();
  });

  it("schedules successfully when every submitted id is regular (no regression on the happy path)", async () => {
    const alice = person({ id: "p_alice", personnelType: "חובה" });
    const bob = person({ id: "p_bob", personnelType: "חובה" });
    loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [alice, bob] } });
    createPlannedOccurrences.mockResolvedValue([
      { id: "o1", rangeDate: "2026-09-03", personId: "p_alice", status: "planned", createdByPersonId: "mgr1", createdByPersonName: "מנהל בדיקה", resolvedByPersonId: null, resolvedByPersonName: null, resolvedAt: null, createdAt: "2026-08-25T00:00:00.000Z" },
      { id: "o2", rangeDate: "2026-09-03", personId: "p_bob", status: "planned", createdByPersonId: "mgr1", createdByPersonName: "מנהל בדיקה", resolvedByPersonId: null, resolvedByPersonName: null, resolvedAt: null, createdAt: "2026-08-25T00:00:00.000Z" },
    ]);

    const result = await createPlannedShootingRangeAction("2026-09-03", ["p_alice", "p_bob"]);

    expect(result).toEqual({ ok: true, scheduledCount: 2 });
    expect(createPlannedOccurrences).toHaveBeenCalledWith("2026-09-03", ["p_alice", "p_bob"], "mgr1", "מנהל בדיקה");
  });
});
