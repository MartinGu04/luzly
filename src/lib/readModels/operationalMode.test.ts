import { afterEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";
import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";

const resolveOperationalMode = vi.fn();
const loadEmergencyRoster = vi.fn();

vi.mock("@/lib/emergencyMode/state", () => ({ resolveOperationalMode }));
vi.mock("./emergencyRoster", () => ({ loadEmergencyRoster }));

const { resolveOperationalRoster } = await import("./operationalMode");

afterEach(() => {
  vi.clearAllMocks();
});

const PERSONNEL: Person[] = [];

const PERIOD: EmergencyModePeriod = {
  id: "period1",
  activatedAt: "2026-08-26T14:00:00.000Z",
  activatedByUserId: "u1",
  activatedByPersonId: "p1",
  activatedByPersonName: "מנהל בדיקה",
  startDate: "2026-08-26",
  deactivatedAt: null,
  deactivatedByUserId: null,
  deactivatedByPersonId: null,
  deactivatedByPersonName: null,
  endDate: null,
};

describe("resolveOperationalRoster", () => {
  it("resolves to regular and NEVER fetches the emergency roster when mode is regular", async () => {
    resolveOperationalMode.mockResolvedValue({ kind: "regular" });

    const result = await resolveOperationalRoster(PERSONNEL);

    expect(result).toEqual({ mode: "regular" });
    expect(loadEmergencyRoster).not.toHaveBeenCalled();
  });

  it("resolves to emergency with assignments when the roster loads successfully", async () => {
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: PERIOD });
    loadEmergencyRoster.mockResolvedValue({
      status: "ok",
      assignments: [{ date: "2026-08-26", period: "day", desk: "הוגוורט", personId: "p1", personName: "אליס", sourceCell: "C2" }],
      diagnostics: [],
      fetchedAt: "2026-08-26T14:05:00.000Z",
    });

    const result = await resolveOperationalRoster(PERSONNEL);

    expect(result.mode).toBe("emergency");
    if (result.mode !== "emergency") throw new Error("unreachable");
    expect(result.period).toEqual(PERIOD);
    expect(result.assignments).toHaveLength(1);
    expect(result.fetchedAt).toBe("2026-08-26T14:05:00.000Z");
  });

  it("resolves to emergency_unavailable (never regular, never silently regular data) when the roster is unreadable", async () => {
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: PERIOD });
    loadEmergencyRoster.mockResolvedValue({ status: "configuration_error", message: "boom" });

    const result = await resolveOperationalRoster(PERSONNEL);

    expect(result).toEqual({ mode: "emergency_unavailable", period: PERIOD, message: "boom" });
  });
});
