import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";

const getAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();
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
const notifyManagersOfSelfReportSubmitted = vi.fn();

vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));
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
  notifyManagersOfSelfReportSubmitted,
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

function personnelSheet(rows: (string | boolean)[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}

function shootingRangesSheet(rows: (string | number)[][]): RawSheet {
  return { name: "מטווחים", values: rows };
}

function personnelRowsWithType(type: string, flags: { technician?: boolean; supervisor?: boolean } = {}): (string | boolean)[][] {
  const header = ["שם", "מייל", 'סוג כ"א', "טכנאי", 'אחמ"ש'];
  return [header, ["דני בדיקה", "dani@example.invalid", type, flags.technician ?? true, flags.supervisor ?? false]];
}

function personnelSnapshot(personnelRows: (string | boolean)[][], shootingRangesRows: (string | number)[][] = []) {
  return {
    fetchedAt: "2026-08-25T08:00:00.000Z",
    sheets: [personnelSheet(personnelRows), shootingRangesSheet(shootingRangesRows)],
  };
}

describe("submitSelfReportShootingRangeAction -- eligibility (regular-service AND אחמ\"ש/טכנאי)", () => {
  beforeEach(() => {
    getAuthenticatedIdentity.mockReset();
    getWorkbookSnapshot.mockReset();
    insertSelfReport.mockReset();
    notifyManagersOfSelfReportSubmitted.mockReset();
    insertSelfReport.mockResolvedValue({ id: "report1" });

    getAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "dani@example.invalid", avatarUrl: null });
  });

  it("allows a regular (חובה) person to submit a self-report", async () => {
    getWorkbookSnapshot.mockResolvedValue(personnelSnapshot(personnelRowsWithType("חובה")));

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: true });
    expect(insertSelfReport).toHaveBeenCalledTimes(1);
  });

  describe("manager notification on submission", () => {
    it("notifies managers ONLY after insertSelfReport has actually succeeded, with the reporter's name, performed date, and the persisted report id", async () => {
      getWorkbookSnapshot.mockResolvedValue(personnelSnapshot(personnelRowsWithType("חובה")));
      insertSelfReport.mockResolvedValue({ id: "persisted-report-42" });

      const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

      expect(result).toEqual({ ok: true });
      expect(notifyManagersOfSelfReportSubmitted).toHaveBeenCalledTimes(1);
      const [people, reporterName, performedOn, reportId] = notifyManagersOfSelfReportSubmitted.mock.calls[0];
      expect(reporterName).toBe("דני בדיקה");
      expect(performedOn).toBe("2026-08-20");
      expect(reportId).toBe("persisted-report-42");
      expect(people.map((p: Person) => p.name)).toContain("דני בדיקה");

      // insertSelfReport must be called strictly before the notification.
      const insertOrder = insertSelfReport.mock.invocationCallOrder[0];
      const notifyOrder = notifyManagersOfSelfReportSubmitted.mock.invocationCallOrder[0];
      expect(insertOrder).toBeLessThan(notifyOrder);
    });

    it("never notifies managers when insertSelfReport fails -- the rejection propagates and no notification is ever created", async () => {
      getWorkbookSnapshot.mockResolvedValue(personnelSnapshot(personnelRowsWithType("חובה")));
      insertSelfReport.mockRejectedValue(new Error("db unavailable"));

      await expect(submitSelfReportShootingRangeAction("2026-08-20", null)).rejects.toThrow("db unavailable");

      expect(notifyManagersOfSelfReportSubmitted).not.toHaveBeenCalled();
    });

    it("never notifies managers when an eligibility/relevance check rejects the submission before any insert is attempted", async () => {
      getWorkbookSnapshot.mockResolvedValue(personnelSnapshot(personnelRowsWithType("קבע")));

      const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

      expect(result).toEqual({ ok: false, error: "not_eligible" });
      expect(insertSelfReport).not.toHaveBeenCalled();
      expect(notifyManagersOfSelfReportSubmitted).not.toHaveBeenCalled();
    });
  });

  it("rejects a permanent (קבע) person -- never trusts the client, never inserts a report", async () => {
    getWorkbookSnapshot.mockResolvedValue(personnelSnapshot(personnelRowsWithType("קבע")));

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: false, error: "not_eligible" });
    expect(insertSelfReport).not.toHaveBeenCalled();
  });

  it("rejects a reserve (מילואים) person", async () => {
    getWorkbookSnapshot.mockResolvedValue(personnelSnapshot(personnelRowsWithType("מילואים")));

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: false, error: "not_eligible" });
    expect(insertSelfReport).not.toHaveBeenCalled();
  });

  it("rejects an unclassified/missing personnel type -- fails closed, never assumed eligible", async () => {
    getWorkbookSnapshot.mockResolvedValue(personnelSnapshot(personnelRowsWithType("משהו אחר")));

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: false, error: "not_eligible" });
  });

  it("rejects a regular (חובה) person who is neither אחמ\"ש nor טכנאי", async () => {
    getWorkbookSnapshot.mockResolvedValue(personnelSnapshot(personnelRowsWithType("חובה", { technician: false, supervisor: false })));

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: false, error: "not_eligible" });
    expect(insertSelfReport).not.toHaveBeenCalled();
  });

  it("allows a regular (חובה) אחמ\"ש even without the טכנאי flag", async () => {
    getWorkbookSnapshot.mockResolvedValue(personnelSnapshot(personnelRowsWithType("חובה", { technician: false, supervisor: true })));

    const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

    expect(result).toEqual({ ok: true });
  });

  describe("רלוונטיות -- a לא רלוונטי caller can never self-report", () => {
    it("rejects the caller when their current מטווחים sheet row is explicitly לא רלוונטי", async () => {
      getWorkbookSnapshot.mockResolvedValue(
        personnelSnapshot(personnelRowsWithType("חובה"), [
          ["שם", "רלוונטיות", "סיבה / הערה"],
          ["דני בדיקה", "לא רלוונטי", "פטור שמירות"],
        ]),
      );

      const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

      expect(result).toEqual({ ok: false, error: "not_relevant" });
      expect(insertSelfReport).not.toHaveBeenCalled();
    });

    it("still allows the caller when their row is explicitly רלוונטי", async () => {
      getWorkbookSnapshot.mockResolvedValue(
        personnelSnapshot(personnelRowsWithType("חובה"), [
          ["שם", "רלוונטיות"],
          ["דני בדיקה", "רלוונטי"],
        ]),
      );

      const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

      expect(result).toEqual({ ok: true });
    });

    it("still allows the caller when the sheet has no explicit רלוונטיות signal for them at all", async () => {
      getWorkbookSnapshot.mockResolvedValue(personnelSnapshot(personnelRowsWithType("חובה")));

      const result = await submitSelfReportShootingRangeAction("2026-08-20", null);

      expect(result).toEqual({ ok: true });
    });
  });
});

describe("createPlannedShootingRangeAction -- eligibility (regular-service AND אחמ\"ש/טכנאי)", () => {
  beforeEach(() => {
    loadManagerPersonnelContext.mockReset();
    getWorkbookSnapshot.mockReset();
    createPlannedOccurrences.mockReset();
    notifyPeopleScheduledForRange.mockReset();
    scheduleManagerConfirmationRequiredJob.mockReset();
    createPlannedOccurrences.mockResolvedValue([{ id: "o1", rangeDate: "2026-09-03", personId: "p_regular", status: "planned", createdByPersonId: "mgr1", createdByPersonName: "מנהל בדיקה", resolvedByPersonId: null, resolvedByPersonName: null, resolvedAt: null, createdAt: "2026-08-25T00:00:00.000Z" }]);
    getWorkbookSnapshot.mockResolvedValue({ fetchedAt: "2026-08-25T08:00:00.000Z", sheets: [shootingRangesSheet([])] });
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

  describe("רלוונטיות -- a לא רלוונטי person can no longer be scheduled", () => {
    it("drops a לא רלוונטי roster id from the scheduled set, exactly like a foreign/non-roster id", async () => {
      const eligible = person({ id: "p_eligible", name: "כשיר בדיקה" });
      const notRelevant = person({ id: "p_not_relevant", name: "לא רלוונטי בדיקה" });
      loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [eligible, notRelevant] } });
      getWorkbookSnapshot.mockResolvedValue({
        fetchedAt: "2026-08-25T08:00:00.000Z",
        sheets: [
          shootingRangesSheet([
            ["שם", "רלוונטיות", "סיבה / הערה"],
            ["לא רלוונטי בדיקה", "לא רלוונטי", "פטור שמירות"],
          ]),
        ],
      });

      const result = await createPlannedShootingRangeAction("2026-09-03", ["p_eligible", "p_not_relevant"]);

      expect(result).toEqual({ ok: true, scheduledCount: 1 });
      expect(createPlannedOccurrences).toHaveBeenCalledWith("2026-09-03", ["p_eligible"], "mgr1", "מנהל בדיקה");
    });

    it("fails with invalid_targets when every submitted id is לא רלוונטי", async () => {
      const notRelevant = person({ id: "p_not_relevant", name: "לא רלוונטי בדיקה" });
      loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [notRelevant] } });
      getWorkbookSnapshot.mockResolvedValue({
        fetchedAt: "2026-08-25T08:00:00.000Z",
        sheets: [
          shootingRangesSheet([
            ["שם", "רלוונטיות"],
            ["לא רלוונטי בדיקה", "לא רלוונטי"],
          ]),
        ],
      });

      const result = await createPlannedShootingRangeAction("2026-09-03", ["p_not_relevant"]);

      expect(result).toEqual({ ok: false, error: "invalid_targets" });
      expect(createPlannedOccurrences).not.toHaveBeenCalled();
    });

    it("still schedules an eligible person with no explicit רלוונטיות signal, or an explicit רלוונטי signal", async () => {
      const eligible = person({ id: "p_eligible", name: "כשיר בדיקה" });
      loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [eligible] } });
      getWorkbookSnapshot.mockResolvedValue({
        fetchedAt: "2026-08-25T08:00:00.000Z",
        sheets: [
          shootingRangesSheet([
            ["שם", "רלוונטיות"],
            ["כשיר בדיקה", "רלוונטי"],
          ]),
        ],
      });
      createPlannedOccurrences.mockResolvedValue([{ id: "o1", rangeDate: "2026-09-03", personId: "p_eligible", status: "planned", createdByPersonId: "mgr1", createdByPersonName: "מנהל בדיקה", resolvedByPersonId: null, resolvedByPersonName: null, resolvedAt: null, createdAt: "2026-08-25T00:00:00.000Z" }]);

      const result = await createPlannedShootingRangeAction("2026-09-03", ["p_eligible"]);

      expect(result).toEqual({ ok: true, scheduledCount: 1 });
    });
  });
});
