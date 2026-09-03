import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleConfigError } from "@/lib/google";
import type { Person } from "@/lib/domain/types";

const getEmergencyWorkbookSnapshot = vi.fn();
vi.mock("@/lib/sync", () => ({ getEmergencyWorkbookSnapshot }));

const { loadEmergencyRoster } = await import("./emergencyRoster");

afterEach(() => {
  vi.clearAllMocks();
});

const PERSONNEL: Person[] = [
  {
    id: "p1",
    name: "אליס בדיקה",
    email: "alice@example.invalid",
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    dischargeDate: null,
    enlistmentDate: null,
  },
];

describe("loadEmergencyRoster", () => {
  it("returns configuration_error when the emergency Google config is missing (never throws)", async () => {
    getEmergencyWorkbookSnapshot.mockRejectedValue(new GoogleConfigError("Missing Google Sheets configuration: GOOGLE_EMERGENCY_SPREADSHEET_ID."));

    const result = await loadEmergencyRoster(PERSONNEL);

    expect(result.status).toBe("configuration_error");
  });

  it("re-throws a genuine unexpected error (not a config problem)", async () => {
    getEmergencyWorkbookSnapshot.mockRejectedValue(new Error("network down"));

    await expect(loadEmergencyRoster(PERSONNEL)).rejects.toThrow("network down");
  });

  it("returns configuration_error when the snapshot is missing the משמרות sheet", async () => {
    getEmergencyWorkbookSnapshot.mockResolvedValue({ fetchedAt: "2026-08-26T10:00:00.000Z", sheets: [] });

    const result = await loadEmergencyRoster(PERSONNEL);

    expect(result.status).toBe("configuration_error");
  });

  it("parses assignments from the משמרות sheet and returns them with diagnostics + fetchedAt", async () => {
    getEmergencyWorkbookSnapshot.mockResolvedValue({
      fetchedAt: "2026-08-26T10:00:00.000Z",
      sheets: [
        {
          name: "משמרות",
          values: [
            ["ס קרקעי", "צ", "הוגוורט", "פ'", "ק'", "הנחשונים", "כחולה", 'מפקד כטמ"מ', "ס' אוורי ב'", "תיעוד", "משה דץ הצדיק", "מפקד מכלול", "סוג משמרת", "יום בשבוע", "תאריכים"],
            ["", "", "אליס בדיקה", "", "", "", "", "", "", "", "", "", "יום", "", "26/08/2026"],
          ],
        },
      ],
    });

    const result = await loadEmergencyRoster(PERSONNEL);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].personId).toBe("p1");
    expect(result.fetchedAt).toBe("2026-08-26T10:00:00.000Z");
    expect(result.diagnostics).toEqual([]);
  });
});
