import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleConfigError } from "@/lib/google";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { stableIdFromName } from "@/lib/parsers/personnel";

const loadFairnessWorkbookContext = vi.fn();
const getEmergencyWorkbookSnapshot = vi.fn();
const getActiveEmergencyModePeriod = vi.fn();

vi.mock("./fairnessWorkbookContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fairnessWorkbookContext")>();
  return { ...actual, loadFairnessWorkbookContext };
});
vi.mock("@/lib/sync", () => ({ getEmergencyWorkbookSnapshot }));
vi.mock("@/lib/emergencyMode/store", () => ({ getActiveEmergencyModePeriod }));

const { loadEmergencyFairnessReadModel } = await import("./emergencyFairnessLoader");

const PERSON: Person = {
  id: "p1",
  name: "אליס בדיקה",
  email: "alice@example.invalid",
  isManager: false,
  isTechnician: false,
  isSupervisor: false,
  personnelType: null,
  dischargeDate: null,
  enlistmentDate: null,
};

function personnelSheet(): RawSheet {
  return { name: 'כ"א', values: [["שם", "מייל"], [PERSON.name, PERSON.email]] };
}

function okContext() {
  return {
    status: "ok" as const,
    context: {
      person: PERSON,
      people: [PERSON],
      avatarByPersonId: new Map<string, string | null>(),
      snapshot: { fetchedAt: "2026-08-26T08:00:00.000Z", sheets: [personnelSheet()] },
    },
  };
}

const SHIFTS_SHEET: RawSheet = {
  name: "משמרות",
  values: [
    ["ס קרקעי", "צ", "הוגוורט", "פ'", "ק'", "הנחשונים", "כחולה", 'מפקד כטמ"מ', "ס' אוורי ב'", "תיעוד", "משה דץ הצדיק", "מפקד מכלול", "סוג משמרת", "יום בשבוע", "תאריכים"],
    ["", "", PERSON.name, "", "", "", "", "", "", "", "", "", "יום", "", "26/08/2026"],
  ],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadEmergencyFairnessReadModel — auth pass-through", () => {
  it.each(["unauthenticated", "missing_email", "unmapped", "ambiguous_identity"])("%s: passes through untouched, never fetches the emergency workbook", async (status) => {
    loadFairnessWorkbookContext.mockResolvedValue({ status });

    const result = await loadEmergencyFairnessReadModel();

    expect(result).toEqual({ status });
    expect(getEmergencyWorkbookSnapshot).not.toHaveBeenCalled();
  });
});

describe("loadEmergencyFairnessReadModel — emergency workbook availability", () => {
  it("returns 'unavailable' (never a hard error) when the emergency Google config is missing", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    getEmergencyWorkbookSnapshot.mockRejectedValue(
      new GoogleConfigError("Missing Google Sheets configuration: GOOGLE_EMERGENCY_SPREADSHEET_ID."),
    );

    const result = await loadEmergencyFairnessReadModel();

    expect(result).toEqual({ status: "unavailable" });
  });

  it("re-throws a genuine unexpected error (not a config problem)", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    getEmergencyWorkbookSnapshot.mockRejectedValue(new Error("network down"));

    await expect(loadEmergencyFairnessReadModel()).rejects.toThrow("network down");
  });

  it("returns 'unavailable' when the snapshot is missing the משמרות sheet", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    getEmergencyWorkbookSnapshot.mockResolvedValue({ fetchedAt: "2026-08-26T10:00:00.000Z", sheets: [] });

    const result = await loadEmergencyFairnessReadModel();

    expect(result).toEqual({ status: "unavailable" });
  });

  it("requests exactly the shifts+fairnessGroups emergency sources -- never the regular schedule sheet", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    getEmergencyWorkbookSnapshot.mockResolvedValue({ fetchedAt: "2026-08-26T10:00:00.000Z", sheets: [SHIFTS_SHEET] });
    getActiveEmergencyModePeriod.mockResolvedValue(null);

    await loadEmergencyFairnessReadModel();

    expect(getEmergencyWorkbookSnapshot).toHaveBeenCalledWith(["shifts", "fairnessGroups"]);
  });
});

describe("loadEmergencyFairnessReadModel — success", () => {
  it("builds an ok read model reflecting full workbook history, with activePeriod as display-only context (null when inactive)", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    getEmergencyWorkbookSnapshot.mockResolvedValue({ fetchedAt: "2026-08-26T10:00:00.000Z", sheets: [SHIFTS_SHEET] });
    getActiveEmergencyModePeriod.mockResolvedValue(null);

    const result = await loadEmergencyFairnessReadModel();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.model.activePeriod).toBeNull();
    expect(result.model.fetchedAt).toBe("2026-08-26T10:00:00.000Z");
  });

  it("works even when the fairnessGroups sheet is entirely absent -- degrades to empty group membership, never throws", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    getEmergencyWorkbookSnapshot.mockResolvedValue({ fetchedAt: "2026-08-26T10:00:00.000Z", sheets: [SHIFTS_SHEET] });
    getActiveEmergencyModePeriod.mockResolvedValue(null);

    const result = await loadEmergencyFairnessReadModel();

    expect(result.status).toBe("ok");
  });

  it("still reflects a resolved assignment's count even while Emergency Mode is currently inactive (full-history semantics)", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    getEmergencyWorkbookSnapshot.mockResolvedValue({ fetchedAt: "2026-08-26T10:00:00.000Z", sheets: [SHIFTS_SHEET] });
    getActiveEmergencyModePeriod.mockResolvedValue(null);

    const result = await loadEmergencyFairnessReadModel();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const allRows = result.model.groups.flatMap((group) => group.rows);
    const aliceRow = allRows.find((row) => row.personId === stableIdFromName(PERSON.name));
    expect(aliceRow?.total).toBe(1);
  });

  it("threads the currently active period through as display-only context when Emergency Mode IS active", async () => {
    loadFairnessWorkbookContext.mockResolvedValue(okContext());
    getEmergencyWorkbookSnapshot.mockResolvedValue({ fetchedAt: "2026-08-26T10:00:00.000Z", sheets: [SHIFTS_SHEET] });
    const period = {
      id: "period1",
      activatedAt: "2026-08-26T06:00:00.000Z",
      activatedByUserId: "u_mgr",
      activatedByPersonId: "p_mgr",
      activatedByPersonName: "מנהל בדיקה",
      startDate: "2026-08-26",
      deactivatedAt: null,
      deactivatedByUserId: null,
      deactivatedByPersonId: null,
      deactivatedByPersonName: null,
      endDate: null,
    };
    getActiveEmergencyModePeriod.mockResolvedValue(period);

    const result = await loadEmergencyFairnessReadModel();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.model.activePeriod).toEqual(period);
  });
});
