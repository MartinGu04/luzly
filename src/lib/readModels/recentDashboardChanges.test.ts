import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecentSettledJobRow } from "@/lib/notifications/engine/store";

const getAuthenticatedIdentity = vi.fn();
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));

const getRecentSettledJobsForRecipient = vi.fn();
vi.mock("@/lib/notifications/engine/store", () => ({ getRecentSettledJobsForRecipient }));

const {
  loadRecentDashboardChanges,
  RECENT_DASHBOARD_CHANGES_HORIZON_HOURS,
  RECENT_DASHBOARD_CHANGES_LIMIT,
} = await import("./recentDashboardChanges");

const ME_ID = "u_me";
const NOW = new Date("2026-08-16T12:00:00.000Z");

function job(overrides: Partial<RecentSettledJobRow> = {}): RecentSettledJobRow {
  return {
    id: "job_1",
    category: "shift_change",
    title: "⚠️ שינוי בשיבוץ",
    body: "השיבוץ שלך ליום חמישי השתנה: יום → לילה",
    path: "/schedule",
    sourceRef: "shift:p_ilay:2026-08-19",
    createdAt: "2026-08-16T11:42:00.000Z",
    ...overrides,
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getAuthenticatedIdentity.mockReset();
  getRecentSettledJobsForRecipient.mockReset();
  getAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: ME_ID, email: "me@example.com", avatarUrl: null });
  getRecentSettledJobsForRecipient.mockResolvedValue([]);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("loadRecentDashboardChanges -- authorization", () => {
  it("1. queries only the authenticated user's own recipient id", async () => {
    await loadRecentDashboardChanges(NOW);
    expect(getRecentSettledJobsForRecipient).toHaveBeenCalledWith(ME_ID, expect.anything(), expect.anything(), expect.anything());
  });

  it("returns an empty list without querying the store when unauthenticated", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadRecentDashboardChanges(NOW);
    expect(result).toEqual([]);
    expect(getRecentSettledJobsForRecipient).not.toHaveBeenCalled();
  });

  it("returns an empty list without querying the store for a missing-email identity", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: ME_ID });
    const result = await loadRecentDashboardChanges(NOW);
    expect(result).toEqual([]);
    expect(getRecentSettledJobsForRecipient).not.toHaveBeenCalled();
  });
});

describe("loadRecentDashboardChanges -- category filtering", () => {
  it("2. requests exactly the personal semantic-change categories (shift/team/duty)", async () => {
    await loadRecentDashboardChanges(NOW);
    const [, categories] = getRecentSettledJobsForRecipient.mock.calls[0];
    expect(new Set(categories)).toEqual(new Set(["shift_change", "team_change", "duty_change"]));
  });

  it("3. never requests coverage_gap", async () => {
    await loadRecentDashboardChanges(NOW);
    const [, categories] = getRecentSettledJobsForRecipient.mock.calls[0];
    expect(categories).not.toContain("coverage_gap");
  });

  it("never requests any reminder category", async () => {
    await loadRecentDashboardChanges(NOW);
    const [, categories] = getRecentSettledJobsForRecipient.mock.calls[0];
    for (const reminderCategory of ["tomorrow_shift", "tomorrow_duty", "tomorrow_logistics_withdrawal", "constraints_sunday", "constraints_monday"]) {
      expect(categories).not.toContain(reminderCategory);
    }
  });

  it("defensively drops a row whose category the store layer returned outside the requested set", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue([job({ category: "coverage_gap" })]);
    const result = await loadRecentDashboardChanges(NOW);
    expect(result).toEqual([]);
  });
});

describe("loadRecentDashboardChanges -- time horizon / limit", () => {
  it("6. requests exactly the 72-hour horizon from `now`", async () => {
    await loadRecentDashboardChanges(NOW);
    const [, , sinceIso] = getRecentSettledJobsForRecipient.mock.calls[0];
    expect(RECENT_DASHBOARD_CHANGES_HORIZON_HOURS).toBe(72);
    expect(sinceIso).toBe(new Date(NOW.getTime() - 72 * 60 * 60_000).toISOString());
  });

  it("8. requests exactly the configured max item count", async () => {
    await loadRecentDashboardChanges(NOW);
    const [, , , limit] = getRecentSettledJobsForRecipient.mock.calls[0];
    expect(RECENT_DASHBOARD_CHANGES_LIMIT).toBe(3);
    expect(limit).toBe(3);
  });

  it("7. preserves the store layer's newest-first ordering (never re-sorts)", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue([
      job({ id: "newest", createdAt: "2026-08-16T11:00:00.000Z" }),
      job({ id: "older", createdAt: "2026-08-15T11:00:00.000Z" }),
    ]);
    const result = await loadRecentDashboardChanges(NOW);
    expect(result.map((change) => change.key)).toEqual(["change:newest", "change:older"]);
  });
});

describe("loadRecentDashboardChanges -- safe presentation model", () => {
  it("9. never exposes internal notification-engine fields", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue([job()]);
    const [change] = await loadRecentDashboardChanges(NOW);
    expect(Object.keys(change).sort()).toEqual(["body", "category", "date", "happenedAt", "href", "key", "title"]);
  });

  it("maps category strings to the short presentation category", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue([
      job({ id: "s", category: "shift_change" }),
      job({ id: "t", category: "team_change", sourceRef: "team:p_ilay:2026-08-20:night" }),
      job({ id: "d", category: "duty_change", sourceRef: "duty:p_ilay:2026-08-21" }),
    ]);
    const result = await loadRecentDashboardChanges(NOW);
    expect(result.map((c) => c.category)).toEqual(["shift", "team", "duty"]);
  });
});

describe("loadRecentDashboardChanges -- navigation / deep links", () => {
  it("18. a valid shift source_ref produces the /schedule?date=... deep link", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue([job({ category: "shift_change", sourceRef: "shift:p_ilay:2026-08-19" })]);
    const [change] = await loadRecentDashboardChanges(NOW);
    expect(change.href).toBe("/schedule?date=2026-08-19");
    expect(change.date).toBe("2026-08-19");
  });

  it("18. a valid team source_ref produces the /schedule?date=... deep link", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue([job({ category: "team_change", sourceRef: "team:p_ilay:2026-08-22:night" })]);
    const [change] = await loadRecentDashboardChanges(NOW);
    expect(change.href).toBe("/schedule?date=2026-08-22");
    expect(change.date).toBe("2026-08-22");
  });

  it("19. a malformed team source_ref falls back to the canonical / destination", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue([job({ category: "team_change", sourceRef: "team:p_ilay:not-a-date:night" })]);
    const [change] = await loadRecentDashboardChanges(NOW);
    expect(change.href).toBe("/");
    expect(change.date).toBeNull();
  });

  it("a null source_ref falls back to the canonical shift destination", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue([job({ category: "shift_change", sourceRef: null })]);
    const [change] = await loadRecentDashboardChanges(NOW);
    expect(change.href).toBe("/schedule");
    expect(change.date).toBeNull();
  });

  it("duty changes always use the canonical /duties destination, even with a parseable date", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue([job({ category: "duty_change", sourceRef: "duty:p_ilay:2026-08-21" })]);
    const [change] = await loadRecentDashboardChanges(NOW);
    expect(change.href).toBe("/duties");
  });

  it("20. never lets a hostile source_ref reach the href -- only a validated YYYY-MM-DD, or the safe fallback", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue([
      job({ category: "shift_change", sourceRef: "shift:p_ilay:javascript:alert(1)" }),
    ]);
    const [change] = await loadRecentDashboardChanges(NOW);
    expect(change.href).toBe("/schedule");
    expect(change.href).not.toContain("javascript");
    expect(change.date).toBeNull();
  });
});

describe("loadRecentDashboardChanges -- failure behavior", () => {
  it("10. a store/query failure never throws -- resolves to an empty list", async () => {
    getRecentSettledJobsForRecipient.mockRejectedValue(new Error("supabase down"));
    const result = await loadRecentDashboardChanges(NOW);
    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[dashboard] recent changes query failed");
  });

  it("10. an auth-resolution failure never throws -- resolves to an empty list", async () => {
    getAuthenticatedIdentity.mockRejectedValue(new Error("auth down"));
    const result = await loadRecentDashboardChanges(NOW);
    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[dashboard] recent changes query failed");
  });

  it("never logs error details (PII-safe fixed string only)", async () => {
    getRecentSettledJobsForRecipient.mockRejectedValue(new Error("some sensitive db detail"));
    await loadRecentDashboardChanges(NOW);
    const loggedArgs = consoleErrorSpy.mock.calls[0];
    expect(loggedArgs).toEqual(["[dashboard] recent changes query failed"]);
  });
});
