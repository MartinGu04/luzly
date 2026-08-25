import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";

const loadManagerPersonnelContext = vi.fn();
vi.mock("@/lib/readModels/managerWorkbookContext", () => ({ loadManagerPersonnelContext }));

const setReserveInclusionPreference = vi.fn();
vi.mock("./store", () => ({ setReserveInclusionPreference }));

const { setReserveInclusionPreferenceAction } = await import("./actions");

const MANAGER: Person = {
  id: "p_manager",
  name: "דני מנהל",
  email: "dani@example.invalid",
  isManager: true,
  isTechnician: false,
  isSupervisor: false,
  personnelType: "קבע",
};

const RESERVE_PERSON: Person = {
  id: "p_roi",
  name: "רועי לוין",
  email: null,
  isManager: false,
  isTechnician: false,
  isSupervisor: true,
  personnelType: "מילואים",
};

const REGULAR_TECHNICIAN: Person = {
  id: "p_tech",
  name: "איתי אוליר",
  email: null,
  isManager: false,
  isTechnician: true,
  isSupervisor: false,
  personnelType: "חובה",
};

beforeEach(() => {
  loadManagerPersonnelContext.mockReset();
  setReserveInclusionPreference.mockReset();
  loadManagerPersonnelContext.mockResolvedValue({
    status: "ok",
    context: { manager: MANAGER, people: [MANAGER, RESERVE_PERSON, REGULAR_TECHNICIAN] },
  });
  setReserveInclusionPreference.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("setReserveInclusionPreferenceAction — input validation", () => {
  it("rejects an empty personId without ever loading manager context", async () => {
    const result = await setReserveInclusionPreferenceAction("", false);
    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(loadManagerPersonnelContext).not.toHaveBeenCalled();
  });
});

describe("setReserveInclusionPreferenceAction — manager gating", () => {
  it("fails closed when the caller is not a manager", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "forbidden" });
    const result = await setReserveInclusionPreferenceAction("p_roi", false);
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(setReserveInclusionPreference).not.toHaveBeenCalled();
  });

  it("fails closed when unauthenticated", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "unauthenticated" });
    const result = await setReserveInclusionPreferenceAction("p_roi", false);
    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(setReserveInclusionPreference).not.toHaveBeenCalled();
  });
});

describe("setReserveInclusionPreferenceAction — target re-validation against a fresh roster", () => {
  it("18. rejects a personId that isn't a genuine current roster member (never trusted from the client)", async () => {
    const result = await setReserveInclusionPreferenceAction("p_does_not_exist", false);
    expect(result).toEqual({ ok: false, error: "invalid_target" });
    expect(setReserveInclusionPreference).not.toHaveBeenCalled();
  });

  it("rejects a roster member who is NOT reserve (e.g. a regular technician) -- the checkbox only ever exists for מילואים", async () => {
    const result = await setReserveInclusionPreferenceAction("p_tech", false);
    expect(result).toEqual({ ok: false, error: "invalid_target" });
    expect(setReserveInclusionPreference).not.toHaveBeenCalled();
  });
});

describe("setReserveInclusionPreferenceAction — success", () => {
  it("12. persists the exclusion with the acting manager's own id/name as audit fields", async () => {
    const result = await setReserveInclusionPreferenceAction("p_roi", false);
    expect(result).toEqual({ ok: true });
    expect(setReserveInclusionPreference).toHaveBeenCalledWith("p_roi", false, "p_manager", "דני מנהל");
  });

  it("also persists a re-inclusion (true)", async () => {
    const result = await setReserveInclusionPreferenceAction("p_roi", true);
    expect(result).toEqual({ ok: true });
    expect(setReserveInclusionPreference).toHaveBeenCalledWith("p_roi", true, "p_manager", "דני מנהל");
  });
});
