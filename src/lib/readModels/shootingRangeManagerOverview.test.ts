import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";

const loadManagerWorkbookContext = vi.fn();
const getJerusalemLocalNow = vi.fn();
const getCompletionsForPersonIds = vi.fn();
const getPlannedOccurrencesForPersonIds = vi.fn();
const fetchEmailToAvatarUrl = vi.fn();
const resolveAvatarUrlsByPersonId = vi.fn();

vi.mock("@/lib/readModels/managerWorkbookContext", async (importOriginal) => {
  // `getManagerWorkbookSheet` is kept REAL (a simple, pure name-lookup over
  // the snapshot the mocked `loadManagerWorkbookContext` below returns) --
  // only the actual auth/fetch boundary is mocked, same convention as
  // `managerOverview.test.ts`'s own dependency mocking.
  const actual = await importOriginal<typeof import("@/lib/readModels/managerWorkbookContext")>();
  return { ...actual, loadManagerWorkbookContext };
});
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));
vi.mock("@/lib/shootingRanges/store", () => ({ getCompletionsForPersonIds, getPlannedOccurrencesForPersonIds }));
vi.mock("@/lib/readModels/personAvatarLookup", () => ({ fetchEmailToAvatarUrl, resolveAvatarUrlsByPersonId }));

const { loadShootingRangeManagerOverview } = await import("./shootingRangeManagerOverview");

function shootingRangesSheet(rows: (string | number)[][]): RawSheet {
  return { name: "מטווחים", values: rows };
}

// Regular-service (חובה) + טכנאי by default -- מטווחים is scoped to
// regular personnel who are also אחמ"ש/טכנאי (see the dedicated
// "eligibility" describe block below), so every pre-existing test needs
// an explicit eligible person.
function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "דני עובד",
    email: "dani@example.invalid",
    isManager: false,
    isTechnician: true,
    isSupervisor: false,
    personnelType: "חובה",
    dischargeDate: null,
    enlistmentDate: null,
    ...overrides,
  };
}

const MANAGER: Person = {
  id: "mgr1",
  name: "מנהל בדיקה",
  email: "mgr@example.invalid",
  isManager: true,
  isTechnician: false,
  isSupervisor: false,
  personnelType: null,
  dischargeDate: null,
  enlistmentDate: null,
};

function okContext(people: Person[], shootingRangesRows: (string | number)[][] = []) {
  return {
    status: "ok" as const,
    context: {
      manager: MANAGER,
      people,
      snapshot: { fetchedAt: "2026-08-25T08:00:00.000Z", sheets: [shootingRangesSheet(shootingRangesRows)] },
      avatarUrl: "https://photo",
    },
  };
}

describe("loadShootingRangeManagerOverview", () => {
  beforeEach(() => {
    loadManagerWorkbookContext.mockReset();
    getJerusalemLocalNow.mockReset();
    getCompletionsForPersonIds.mockReset();
    getPlannedOccurrencesForPersonIds.mockReset();
    fetchEmailToAvatarUrl.mockReset();
    resolveAvatarUrlsByPersonId.mockReset();

    getJerusalemLocalNow.mockReturnValue({ date: "2026-08-25", minuteOfDay: 600 });
    getCompletionsForPersonIds.mockResolvedValue([]);
    getPlannedOccurrencesForPersonIds.mockResolvedValue([]);
    fetchEmailToAvatarUrl.mockResolvedValue(new Map());
    resolveAvatarUrlsByPersonId.mockReturnValue(new Map());
  });

  it("reuses loadManagerWorkbookContext narrowed to exactly [personnel, shootingRanges] -- never the full 5-source manager set", async () => {
    loadManagerWorkbookContext.mockResolvedValue(okContext([person()]));

    await loadShootingRangeManagerOverview();

    expect(loadManagerWorkbookContext).toHaveBeenCalledWith(["personnel", "shootingRanges"]);
  });

  it("passes through every non-ok manager-authorization status unchanged (unauthenticated/missing_email/unmapped/ambiguous_identity/forbidden)", async () => {
    for (const status of ["unauthenticated", "missing_email", "unmapped", "ambiguous_identity", "forbidden"] as const) {
      loadManagerWorkbookContext.mockResolvedValue({ status });
      const result = await loadShootingRangeManagerOverview();
      expect(result).toEqual({ status });
      expect(getCompletionsForPersonIds).not.toHaveBeenCalled();
    }
  });

  it("builds one qualification model per roster person, keyed by their OWN sheet baseline and completions", async () => {
    const alice = person({ id: "p_alice", name: "אליס בדיקה" });
    const bob = person({ id: "p_bob", name: "בוב בדיקה" });
    loadManagerWorkbookContext.mockResolvedValue(
      okContext([alice, bob], [
        ["שם", "תאריך ביצוע מטווח"],
        ["אליס בדיקה", "29/06/2026"],
      ]),
    );

    const result = await loadShootingRangeManagerOverview();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    const alicRow = result.model.rows.find((row) => row.personId === "p_alice");
    const bobRow = result.model.rows.find((row) => row.personId === "p_bob");
    expect(alicRow?.baselineDate).toBe("2026-06-29");
    expect(bobRow?.baselineDate).toBeNull();
    expect(bobRow?.status).toBe("none");
  });

  it("fetches completions/planned occurrences ONCE for the whole roster (bulk), not once per person", async () => {
    loadManagerWorkbookContext.mockResolvedValue(okContext([person({ id: "p1" }), person({ id: "p2" })]));

    await loadShootingRangeManagerOverview();

    expect(getCompletionsForPersonIds).toHaveBeenCalledTimes(1);
    expect(getCompletionsForPersonIds).toHaveBeenCalledWith(["p1", "p2"]);
    expect(getPlannedOccurrencesForPersonIds).toHaveBeenCalledTimes(1);
  });

  it("an approved app completion for one person never leaks into another person's row (per-person grouping is correct)", async () => {
    const alice = person({ id: "p_alice" });
    const bob = person({ id: "p_bob" });
    loadManagerWorkbookContext.mockResolvedValue(okContext([alice, bob]));
    getCompletionsForPersonIds.mockResolvedValue([
      {
        id: "c1",
        personId: "p_alice",
        performedOn: "2026-07-01",
        source: "manager_manual",
        status: "approved",
        notes: null,
        submittedByPersonId: "mgr1",
        submittedByPersonName: "מנהל בדיקה",
        approvedByPersonId: "mgr1",
        approvedByPersonName: "מנהל בדיקה",
        approvedAt: "2026-07-01T00:00:00.000Z",
        linkedPlannedDate: null,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);

    const result = await loadShootingRangeManagerOverview();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.rows.find((row) => row.personId === "p_alice")?.baselineDate).toBe("2026-07-01");
    expect(result.model.rows.find((row) => row.personId === "p_bob")?.baselineDate).toBeNull();
  });

  it("degrades gracefully when the מטווחים sheet has no recognizable header row -- every row falls back to no-baseline, never a crash", async () => {
    loadManagerWorkbookContext.mockResolvedValue(okContext([person()], [["הערות כלליות"], ["טקסט חופשי"]]));

    const result = await loadShootingRangeManagerOverview();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.rows[0].baselineDate).toBeNull();
    expect(result.model.summary.notQualifiedCount).toBe(1);
  });

  it("throws when the workbook snapshot is missing the מטווחים sheet entirely -- a genuine configuration problem, never silently ignored", async () => {
    loadManagerWorkbookContext.mockResolvedValue({
      status: "ok",
      context: { manager: MANAGER, people: [person()], snapshot: { fetchedAt: "2026-08-25T08:00:00.000Z", sheets: [] }, avatarUrl: null },
    });

    await expect(loadShootingRangeManagerOverview()).rejects.toThrow(/מטווחים/);
  });

  it("returns an empty, well-formed model for an empty roster -- never throws on zero people", async () => {
    loadManagerWorkbookContext.mockResolvedValue(okContext([]));

    const result = await loadShootingRangeManagerOverview();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.model.rows).toEqual([]);
    expect(result.model.summary).toEqual({
      qualifiedCount: 0,
      nearingExpiryCount: 0,
      notQualifiedCount: 0,
      notRelevantCount: 0,
      totalCount: 0,
    });
    expect(getCompletionsForPersonIds).toHaveBeenCalledWith([]);
  });

  describe("eligibility (regular-service AND אחמ\"ש/טכנאי)", () => {
    it("excludes a regular person who is neither אחמ\"ש nor טכנאי -- the role half of the rule, not just the service half", async () => {
      const eligible = person({ id: "p_eligible", isTechnician: true });
      const regularOther = person({ id: "p_other", name: "אחר בדיקה", isTechnician: false, isSupervisor: false });
      loadManagerWorkbookContext.mockResolvedValue(okContext([eligible, regularOther]));

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.rows.map((row) => row.personId)).toEqual(["p_eligible"]);
    });

    it("includes a regular אחמ\"ש even without the טכנאי flag", async () => {
      const supervisor = person({ id: "p_sup", isTechnician: false, isSupervisor: true });
      loadManagerWorkbookContext.mockResolvedValue(okContext([supervisor]));

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.rows.map((row) => row.personId)).toEqual(["p_sup"]);
    });

    it("excludes reserve (מילואים) personnel from rows/summary/counts entirely, even when shift-capable", async () => {
      const regular = person({ id: "p_regular", name: "רגיל בדיקה", personnelType: "חובה" });
      const reserve = person({ id: "p_reserve", name: "מילואים בדיקה", personnelType: "מילואים" });
      loadManagerWorkbookContext.mockResolvedValue(okContext([regular, reserve]));

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.rows.map((row) => row.personId)).toEqual(["p_regular"]);
      expect(result.model.summary.totalCount).toBe(1);
    });

    it("includes permanent (קבע) personnel alongside regular (חובה) personnel, via the same shift-capable rule", async () => {
      const regular = person({ id: "p_regular", name: "רגיל בדיקה", personnelType: "חובה" });
      const permanent = person({ id: "p_permanent", name: "קבע בדיקה", personnelType: "קבע" });
      loadManagerWorkbookContext.mockResolvedValue(okContext([regular, permanent]));

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.rows.map((row) => row.personId).sort()).toEqual(["p_permanent", "p_regular"]);
      expect(result.model.summary.totalCount).toBe(2);
    });

    it("excludes a permanent (קבע) person who is neither אחמ\"ש nor טכנאי, same role-half rule as regular", async () => {
      const permanentOther = person({ id: "p_permanent_other", name: "קבע אחר", personnelType: "קבע", isTechnician: false, isSupervisor: false });
      loadManagerWorkbookContext.mockResolvedValue(okContext([permanentOther]));

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.rows).toEqual([]);
    });

    it("never even fetches completions/planned occurrences for a reserve person id", async () => {
      const regular = person({ id: "p_regular", personnelType: "חובה" });
      const reserve = person({ id: "p_reserve", personnelType: "מילואים" });
      loadManagerWorkbookContext.mockResolvedValue(okContext([regular, reserve]));

      await loadShootingRangeManagerOverview();

      expect(getCompletionsForPersonIds).toHaveBeenCalledWith(["p_regular"]);
      expect(getPlannedOccurrencesForPersonIds).toHaveBeenCalledWith(["p_regular"]);
    });

    it("fetches completions/planned occurrences for an eligible permanent person id too", async () => {
      const permanent = person({ id: "p_permanent", personnelType: "קבע" });
      loadManagerWorkbookContext.mockResolvedValue(okContext([permanent]));

      await loadShootingRangeManagerOverview();

      expect(getCompletionsForPersonIds).toHaveBeenCalledWith(["p_permanent"]);
      expect(getPlannedOccurrencesForPersonIds).toHaveBeenCalledWith(["p_permanent"]);
    });

    it("an ambiguous name shared between an eligible and a reserve (ineligible) person still fails closed to null resolution -- filtering never happens before name resolution", async () => {
      const regular = person({ id: "p_regular", name: "כפול כפולי", personnelType: "חובה" });
      const reserve = person({ id: "p_reserve", name: "כפול כפולי", personnelType: "מילואים" });
      loadManagerWorkbookContext.mockResolvedValue(
        okContext([regular, reserve], [
          ["שם", "תאריך ביצוע מטווח"],
          ["כפול כפולי", "01/01/2026"],
        ]),
      );

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      // The ambiguous sheet row resolves to nobody -- the regular person's row must NOT pick it up as their baseline.
      expect(result.model.rows.find((row) => row.personId === "p_regular")?.baselineDate).toBeNull();
    });

    it("excludes a reserve person's pending self-report from the manager review queue too", async () => {
      const reserve = person({ id: "p_reserve", personnelType: "מילואים" });
      loadManagerWorkbookContext.mockResolvedValue(okContext([reserve]));
      getCompletionsForPersonIds.mockResolvedValue([]);

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.pendingSelfReports).toEqual([]);
    });

    it("includes an eligible permanent person's pending self-report in the manager review queue", async () => {
      const permanent = person({ id: "p_permanent", name: "קבע בדיקה", personnelType: "קבע" });
      loadManagerWorkbookContext.mockResolvedValue(okContext([permanent]));
      getCompletionsForPersonIds.mockResolvedValue([
        {
          id: "c1",
          personId: "p_permanent",
          performedOn: "2026-08-01",
          source: "self_report",
          status: "pending",
          notes: null,
          submittedByPersonId: "p_permanent",
          submittedByPersonName: "קבע בדיקה",
          approvedByPersonId: null,
          approvedByPersonName: null,
          approvedAt: null,
          linkedPlannedDate: null,
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ]);

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.pendingSelfReports.map((row) => row.personId)).toEqual(["p_permanent"]);
    });
  });

  describe("unresolvedSheetRowCount (surfacing unmatched מטווחים sheet rows, e.g. a real name mismatch)", () => {
    it("is 0 when every sheet row resolves to exactly one person", async () => {
      const alice = person({ id: "p_alice", name: "אליס בדיקה" });
      loadManagerWorkbookContext.mockResolvedValue(
        okContext([alice], [
          ["שם", "תאריך ביצוע מטווח"],
          ["אליס בדיקה", "29/06/2026"],
        ]),
      );

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.unresolvedSheetRowCount).toBe(0);
    });

    it("counts a sheet row whose name never resolved to a known person -- e.g. a real name mismatch between the sheet and כ״א", async () => {
      const alice = person({ id: "p_alice", name: "אליס בדיקה" });
      loadManagerWorkbookContext.mockResolvedValue(
        okContext([alice], [
          ["שם", "תאריך ביצוע מטווח"],
          ["אליס בדיקה", "29/06/2026"],
          ["שם שלא קיים ברשימה", "01/01/2026"],
        ]),
      );

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.unresolvedSheetRowCount).toBe(1);
    });

    it("counts an unresolved row even when it belongs to an INELIGIBLE person -- the count reflects the whole sheet, computed against the full roster, not just eligible rows", async () => {
      const eligible = person({ id: "p_eligible" });
      const reserveDup = person({ id: "p_dup_a", name: "כפול כפולי", personnelType: "מילואים" });
      const otherDup = person({ id: "p_dup_b", name: "כפול כפולי", personnelType: "מילואים" });
      loadManagerWorkbookContext.mockResolvedValue(
        okContext([eligible, reserveDup, otherDup], [
          ["שם", "תאריך ביצוע מטווח"],
          ["כפול כפולי", "29/06/2026"],
        ]),
      );

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.unresolvedSheetRowCount).toBe(1);
    });

    it("carries the RAW unresolved sourceName text verbatim, so a manager can visually compare it against כ״א themselves", async () => {
      const alice = person({ id: "p_alice", name: "אליס בדיקה" });
      loadManagerWorkbookContext.mockResolvedValue(
        okContext([alice], [
          ["שם", "תאריך ביצוע מטווח"],
          ["אליס בדיקה", "29/06/2026"],
          ["אליס בדיקה 2", "01/01/2026"],
        ]),
      );

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.unresolvedSheetRowNames).toEqual(["אליס בדיקה 2"]);
    });
  });

  describe("role grouping (canonical classifyRoleGroup, passed through to buildShootingRangeManagerReadModel)", () => {
    it("passes each eligible person's real isSupervisor/isTechnician flags through, never re-derived", async () => {
      const supervisor = person({ id: "p_sup", isSupervisor: true, isTechnician: false });
      const technician = person({ id: "p_tech", isSupervisor: false, isTechnician: true });
      loadManagerWorkbookContext.mockResolvedValue(okContext([supervisor, technician]));

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.rows.find((r) => r.personId === "p_sup")?.roleGroup).toBe("supervisor");
      expect(result.model.rows.find((r) => r.personId === "p_tech")?.roleGroup).toBe("technician");
    });
  });

  describe("end-to-end real-shaped scenario (reproduces a reported case: an eligible person with a genuine מטווחים completion)", () => {
    it("a technician with an exact-matching name and a real DD/MM/YYYY completion date resolves to the correct baseline and expiry -- the full fetch -> parse -> resolve -> baseline chain", async () => {
      const lev = person({ id: "p_lev", name: "לב סינייצקי", isSupervisor: false, isTechnician: true, personnelType: "חובה" });
      loadManagerWorkbookContext.mockResolvedValue(
        okContext([lev], [
          ["שם", "תאריך ביצוע מטווח", "תאריך תפוגה", "סטטוס"],
          ["לב סינייצקי", "29/06/2026", "29/12/2026", "תקף"],
        ]),
      );
      getJerusalemLocalNow.mockReturnValue({ date: "2026-08-25", minuteOfDay: 600 });

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      const row = result.model.rows.find((r) => r.personId === "p_lev");
      expect(row?.baselineDate).toBe("2026-06-29");
      expect(row?.expiryDate).toBe("2026-12-29");
      expect(row?.status).not.toBe("none");
      expect(result.model.unresolvedSheetRowCount).toBe(0);
    });

    it("resolves the same real completion when the sheet uses the ACTUAL production header 'תאריך ביצוע מטווחים' (plural) alongside the real 'תאריך תפוגה' / 'סטטוס' / 'רלוונטיות' columns -- regression for a header-name mismatch that silently dropped every row in the whole sheet, not just one person's", async () => {
      const lev = person({ id: "p_lev", name: "לב סיניצקי", isSupervisor: false, isTechnician: true, personnelType: "חובה" });
      loadManagerWorkbookContext.mockResolvedValue(
        okContext([lev], [
          ["שם", "תאריך ביצוע מטווחים", "תאריך תפוגה", "סטטוס", "רלוונטיות"],
          ["לב סיניצקי", "29/06/2026", "29/12/2026", "תקף", "רלוונטי"],
        ]),
      );
      getJerusalemLocalNow.mockReturnValue({ date: "2026-08-25", minuteOfDay: 600 });

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      const row = result.model.rows.find((r) => r.personId === "p_lev");
      expect(row?.baselineDate).toBe("2026-06-29");
      expect(row?.expiryDate).toBe("2026-12-29");
      expect(result.model.unresolvedSheetRowCount).toBe(0);
    });
  });

  describe("רלוונטיות (excluded from missing/expired/requires-attention, remains visible in their role group)", () => {
    it("a לא רלוונטי eligible person still appears in rows/roleGroup, is excluded from qualifiedCount/notQualifiedCount, and is counted in notRelevantCount instead", async () => {
      const alice = person({ id: "p_alice", name: "אליס בדיקה" });
      loadManagerWorkbookContext.mockResolvedValue(
        okContext([alice], [
          ["שם", "תאריך ביצוע מטווחים", "רלוונטיות", "סיבה / הערה"],
          ["אליס בדיקה", "", "לא רלוונטי", "פטור שמירות"],
        ]),
      );

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      const row = result.model.rows.find((r) => r.personId === "p_alice");
      expect(row?.status).toBe("not_relevant");
      expect(row?.notRelevantReason).toBe("פטור שמירות");
      expect(result.model.summary).toEqual({
        qualifiedCount: 0,
        nearingExpiryCount: 0,
        notQualifiedCount: 0,
        notRelevantCount: 1,
        totalCount: 1,
      });
    });

    it("is never counted as missing/expired and never appears in requiresAttention, even with a stale completion date that would otherwise be expired", async () => {
      const alice = person({ id: "p_alice", name: "אליס בדיקה" });
      loadManagerWorkbookContext.mockResolvedValue(
        okContext([alice], [
          ["שם", "תאריך ביצוע מטווחים", "רלוונטיות", "סיבה / הערה"],
          ["אליס בדיקה", "23/02/2026", "לא רלוונטי", "פטור שמירות"],
        ]),
      );
      getJerusalemLocalNow.mockReturnValue({ date: "2026-08-25", minuteOfDay: 600 });

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      const row = result.model.rows.find((r) => r.personId === "p_alice");
      expect(row?.status).toBe("not_relevant");
      expect(row?.requiresAttention).toBe(false);
      expect(result.model.summary.notQualifiedCount).toBe(0);
    });
  });

  describe("Google profile photo avatars (bulk resolution, never per-person)", () => {
    it("resolves roster avatars in ONE bulk call regardless of roster size, never a per-person lookup", async () => {
      const alice = person({ id: "p_alice" });
      const bob = person({ id: "p_bob" });
      loadManagerWorkbookContext.mockResolvedValue(okContext([alice, bob]));
      resolveAvatarUrlsByPersonId.mockReturnValue(new Map([["p_alice", "https://example.invalid/alice.jpg"], ["p_bob", null]]));

      const result = await loadShootingRangeManagerOverview();

      expect(fetchEmailToAvatarUrl).toHaveBeenCalledTimes(1);
      expect(resolveAvatarUrlsByPersonId).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.rows.find((r) => r.personId === "p_alice")?.avatarUrl).toBe("https://example.invalid/alice.jpg");
      expect(result.model.rows.find((r) => r.personId === "p_bob")?.avatarUrl).toBeNull();
    });

    it("a person absent from the resolved map falls back to null (never a placeholder), so the UI falls back to initials", async () => {
      loadManagerWorkbookContext.mockResolvedValue(okContext([person({ id: "p_alice" })]));
      resolveAvatarUrlsByPersonId.mockReturnValue(new Map());

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.rows[0].avatarUrl).toBeNull();
    });

    it("degrades gracefully (never fails the whole panel) when the avatar lookup rejects", async () => {
      loadManagerWorkbookContext.mockResolvedValue(okContext([person({ id: "p_alice" })]));
      fetchEmailToAvatarUrl.mockRejectedValue(new Error("Admin API unavailable"));

      const result = await loadShootingRangeManagerOverview();

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.model.rows[0].avatarUrl).toBeNull();
    });
  });
});
