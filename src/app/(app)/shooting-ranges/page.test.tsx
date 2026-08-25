import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ShootingRangeQualificationReadModel } from "@/lib/readModels/buildShootingRangeQualificationReadModel";

const loadShootingRangeQualification = vi.fn();
vi.mock("@/lib/readModels/shootingRangeQualification", () => ({ loadShootingRangeQualification }));

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => redirect(...args) }));

const { default: ShootingRangesPage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  loadShootingRangeQualification.mockReset();
  redirect.mockReset();
});

function person(overrides: Partial<{ isManager: boolean }> = {}) {
  return { id: "p1", name: "מרטין בדיקה", email: "m@example.com", isManager: false, isTechnician: false, isSupervisor: false, personnelType: null, ...overrides };
}

function model(overrides: Partial<ShootingRangeQualificationReadModel> = {}): ShootingRangeQualificationReadModel {
  return {
    personId: "p1",
    baselineDate: null,
    baselineSource: null,
    expiryDate: null,
    status: "none",
    notRelevantReason: null,
    plannedRange: null,
    pendingSelfReport: null,
    history: [],
    ...overrides,
  };
}

describe("ShootingRangesPage", () => {
  it("redirects to /login when unauthenticated", async () => {
    loadShootingRangeQualification.mockResolvedValue({ status: "unauthenticated" });
    const page = await ShootingRangesPage();
    render(page);
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("shows the access-denied screen for an unmapped identity", async () => {
    loadShootingRangeQualification.mockResolvedValue({ status: "unmapped" });
    const page = await ShootingRangesPage();
    render(page);
    expect(screen.getByText(/אין לך הרשאה/)).toBeInTheDocument();
  });

  it("renders a calm, truthful 'no data' state -- never a fabricated expiry", async () => {
    loadShootingRangeQualification.mockResolvedValue({ status: "ok", person: person(), model: model(), avatarUrl: null });
    const page = await ShootingRangesPage();
    render(page);
    expect(screen.getByText("אין עדיין נתוני מטווח מאומתים עבורך.")).toBeInTheDocument();
    expect(screen.getByText("ביצעתי מטווח")).toBeInTheDocument();
  });

  it("renders the qualification card with baseline/expiry dates when data exists", async () => {
    loadShootingRangeQualification.mockResolvedValue({
      status: "ok",
      person: person(),
      model: model({ baselineDate: "2026-06-29", baselineSource: "sheet", expiryDate: "2026-12-29", status: "valid" }),
      avatarUrl: null,
    });
    const page = await ShootingRangesPage();
    render(page);
    expect(screen.getByText("מטווח אחרון: 29/06/2026")).toBeInTheDocument();
    expect(screen.getByText("תוקף עד: 29/12/2026")).toBeInTheDocument();
  });

  it("shows a pending self-report notice instead of the report button", async () => {
    loadShootingRangeQualification.mockResolvedValue({
      status: "ok",
      person: person(),
      model: model({ pendingSelfReport: { id: "sr1", performedOn: "2026-08-20", notes: null, createdAt: "2026-08-20T00:00:00.000Z" } }),
      avatarUrl: null,
    });
    const page = await ShootingRangesPage();
    render(page);
    expect(screen.getByText(/ממתין לאישור מנהל/)).toBeInTheDocument();
    expect(screen.queryByText("ביצעתי מטווח")).toBeNull();
  });

  it("shows a manager link only for a manager, pointing to /shooting-ranges/manager", async () => {
    loadShootingRangeQualification.mockResolvedValue({ status: "ok", person: person({ isManager: true }), model: model(), avatarUrl: null });
    const page = await ShootingRangesPage();
    render(page);
    const link = screen.getByText("תצוגת מנהל");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/shooting-ranges/manager");
  });

  it("never shows a manager link for a non-manager", async () => {
    loadShootingRangeQualification.mockResolvedValue({ status: "ok", person: person({ isManager: false }), model: model(), avatarUrl: null });
    const page = await ShootingRangesPage();
    render(page);
    expect(screen.queryByText("תצוגת מנהל")).toBeNull();
  });

  describe("not_applicable (permanent/reserve personnel -- מטווחים is regular-service only)", () => {
    it("shows a calm scope message, never the qualification card or self-report button", async () => {
      loadShootingRangeQualification.mockResolvedValue({ status: "not_applicable", person: person({ isManager: false }), avatarUrl: null });
      const page = await ShootingRangesPage();
      render(page);
      expect(screen.getByText('מטווחים זמין לאחמ"ש/טכנאי בשירות סדיר בלבד.')).toBeInTheDocument();
      expect(screen.queryByText("ביצעתי מטווח")).toBeNull();
      expect(screen.queryByText("כשירות מטווח")).toBeNull();
    });

    it("still shows the manager-overview link for a non-regular MANAGER -- their own ineligibility must never hide it", async () => {
      loadShootingRangeQualification.mockResolvedValue({ status: "not_applicable", person: person({ isManager: true }), avatarUrl: null });
      const page = await ShootingRangesPage();
      render(page);
      expect(screen.getByText("תצוגת מנהל")).toBeInTheDocument();
    });

    it("never shows the manager-overview link for a non-regular non-manager", async () => {
      loadShootingRangeQualification.mockResolvedValue({ status: "not_applicable", person: person({ isManager: false }), avatarUrl: null });
      const page = await ShootingRangesPage();
      render(page);
      expect(screen.queryByText("תצוגת מנהל")).toBeNull();
    });
  });

  describe("not_relevant (this person's own מטווחים sheet row is explicitly לא רלוונטי)", () => {
    it("shows the calm dedicated state, never a countdown/ring or 'אין מידע כשירות'", async () => {
      loadShootingRangeQualification.mockResolvedValue({
        status: "ok",
        person: person(),
        model: model({ status: "not_relevant", notRelevantReason: "פטור שמירות" }),
        avatarUrl: null,
      });
      const page = await ShootingRangesPage();
      render(page);
      expect(screen.getByText("לא רלוונטי לכשירות מטווח")).toBeInTheDocument();
      expect(screen.getByText("סיבה: פטור שמירות")).toBeInTheDocument();
      expect(screen.queryByText("כשירות מטווח")).toBeNull();
      expect(screen.queryByText("אין עדיין נתוני מטווח מאומתים עבורך.")).toBeNull();
      expect(screen.queryByText("ביצעתי מטווח")).toBeNull();
    });

    it("reason is optional -- renders cleanly with no 'סיבה:' line when absent", async () => {
      loadShootingRangeQualification.mockResolvedValue({
        status: "ok",
        person: person(),
        model: model({ status: "not_relevant", notRelevantReason: null }),
        avatarUrl: null,
      });
      const page = await ShootingRangesPage();
      render(page);
      expect(screen.getByText("לא רלוונטי לכשירות מטווח")).toBeInTheDocument();
      expect(screen.queryByText(/^סיבה:/)).toBeNull();
    });

    it("still shows the manager-overview link for a manager who is themselves not_relevant", async () => {
      loadShootingRangeQualification.mockResolvedValue({
        status: "ok",
        person: person({ isManager: true }),
        model: model({ status: "not_relevant" }),
        avatarUrl: null,
      });
      const page = await ShootingRangesPage();
      render(page);
      expect(screen.getByText("תצוגת מנהל")).toBeInTheDocument();
    });

    it("applicability wins over a stale/expired-looking baseline -- never rendered as expired/qualified based on it", async () => {
      loadShootingRangeQualification.mockResolvedValue({
        status: "ok",
        person: person(),
        // Even if a caller mistakenly still populated baseline/expiry, the not_relevant branch must never render the countdown card off them.
        model: model({ status: "not_relevant", notRelevantReason: "פטור שמירות", baselineDate: "2026-02-23", expiryDate: "2026-08-23" }),
        avatarUrl: null,
      });
      const page = await ShootingRangesPage();
      render(page);
      expect(screen.getByText("לא רלוונטי לכשירות מטווח")).toBeInTheDocument();
      expect(screen.queryByText(/מטווח אחרון/)).toBeNull();
      expect(screen.queryByText(/תוקף עד/)).toBeNull();
    });
  });
});
