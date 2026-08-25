import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecentSettledJobRow, RecentSettledJobsResult } from "@/lib/notifications/engine/store";

const getAuthenticatedIdentity = vi.fn();
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));

const getLastVisitedAt = vi.fn();
vi.mock("@/lib/dashboardVisit/store", () => ({ getLastVisitedAt }));

const getRecentSettledJobsForRecipient = vi.fn();
vi.mock("@/lib/notifications/engine/store", () => ({ getRecentSettledJobsForRecipient }));

const { loadDashboardVisitRecap, DASHBOARD_VISIT_RECAP_VISIBLE_LIMIT } = await import("./recentDashboardChanges");

const ME_ID = "u_me";
const NOW = new Date("2026-08-25T10:00:00.000Z");
const PREVIOUS_VISIT = "2026-08-24T20:00:00.000Z";

function job(overrides: Partial<RecentSettledJobRow> = {}): RecentSettledJobRow {
  return {
    id: "job_1",
    category: "shift_change",
    title: "⚠️ שינוי בשיבוץ",
    body: "השיבוץ שלך ליום חמישי השתנה: יום → לילה",
    path: "/schedule",
    sourceRef: "shift:p_ilay:2026-08-19",
    createdAt: "2026-08-24T20:30:00.000Z",
    ...overrides,
  };
}

function jobsResult(rows: RecentSettledJobRow[], totalCount = rows.length): RecentSettledJobsResult {
  return { rows, totalCount };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getAuthenticatedIdentity.mockReset();
  getLastVisitedAt.mockReset();
  getRecentSettledJobsForRecipient.mockReset();
  getAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: ME_ID, email: "me@example.com", avatarUrl: null });
  getLastVisitedAt.mockResolvedValue(PREVIOUS_VISIT);
  getRecentSettledJobsForRecipient.mockResolvedValue(jobsResult([]));
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("loadDashboardVisitRecap -- authorization (12)", () => {
  it("queries only the authenticated user's own recipient id", async () => {
    await loadDashboardVisitRecap(NOW);
    expect(getLastVisitedAt).toHaveBeenCalledWith(ME_ID);
    expect(getRecentSettledJobsForRecipient).toHaveBeenCalledWith(ME_ID, expect.anything(), expect.anything(), expect.anything());
  });

  it("returns an empty recap without querying anything when unauthenticated", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadDashboardVisitRecap(NOW);
    expect(result).toEqual({ visitStartedAt: NOW.toISOString(), items: [], totalCount: 0 });
    expect(getLastVisitedAt).not.toHaveBeenCalled();
    expect(getRecentSettledJobsForRecipient).not.toHaveBeenCalled();
  });

  it("returns an empty recap without querying anything for a missing-email identity", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: ME_ID });
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items).toEqual([]);
    expect(getRecentSettledJobsForRecipient).not.toHaveBeenCalled();
  });
});

describe("loadDashboardVisitRecap -- true 'since previous visit' lower bound (4, 6, 7, 9)", () => {
  it("6. queries changes strictly after the user's own previous-visit timestamp, never a fixed horizon", async () => {
    await loadDashboardVisitRecap(NOW);
    const [, , sinceIso] = getRecentSettledJobsForRecipient.mock.calls[0];
    expect(sinceIso).toBe(PREVIOUS_VISIT);
  });

  it("7. a change immediately BEFORE (or exactly AT) the previous visit is excluded -- proven at the store boundary (strictly-after / .gt semantics), never re-filtered here", async () => {
    // loadDashboardVisitRecap trusts the store's own sinceIso filter (see
    // notifications/engine/store.test.ts's own "previous-visit boundary
    // is strictly AFTER, never >=" coverage, which proves created_at <
    // cutoff and created_at === cutoff are BOTH excluded) -- this only
    // proves the EXACT previous-visit instant is what gets passed down
    // as that boundary.
    await loadDashboardVisitRecap(NOW);
    const [, , sinceIso] = getRecentSettledJobsForRecipient.mock.calls[0];
    expect(sinceIso).toBe(PREVIOUS_VISIT);
  });

  it("8. requests exactly the configured visible-row limit (3)", async () => {
    await loadDashboardVisitRecap(NOW);
    const [, , , limit] = getRecentSettledJobsForRecipient.mock.calls[0];
    expect(DASHBOARD_VISIT_RECAP_VISIBLE_LIMIT).toBe(3);
    expect(limit).toBe(3);
  });

  it("9. a user returning after >72 hours still sees legitimate changes since their last visit -- the old horizon is truly gone", async () => {
    const fourDaysAgo = "2026-08-21T09:00:00.000Z"; // >72h before NOW
    getLastVisitedAt.mockResolvedValue(fourDaysAgo);
    getRecentSettledJobsForRecipient.mockResolvedValue(
      jobsResult([job({ id: "old_but_since_last_visit", createdAt: "2026-08-22T09:00:00.000Z" })]),
    );

    const result = await loadDashboardVisitRecap(NOW);

    const [, , sinceIso] = getRecentSettledJobsForRecipient.mock.calls[0];
    expect(sinceIso).toBe(fourDaysAgo);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].key).toBe("change:old_but_since_last_visit");
  });

  it("totalCount is passed through from the store, independent of how many items are shown (22)", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(
      jobsResult([job({ id: "a" }), job({ id: "b" }), job({ id: "c" })], 7),
    );
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items).toHaveLength(3);
    expect(result.totalCount).toBe(7);
  });
});

describe("loadDashboardVisitRecap -- first-ever visit (5)", () => {
  it("no stored previous visit -> empty recap, and the notification_jobs store is never queried", async () => {
    getLastVisitedAt.mockResolvedValue(null);

    const result = await loadDashboardVisitRecap(NOW);

    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(getRecentSettledJobsForRecipient).not.toHaveBeenCalled();
  });

  it("still returns visitStartedAt on a first visit, so the caller can mark this baseline after mount", async () => {
    getLastVisitedAt.mockResolvedValue(null);
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.visitStartedAt).toBe(NOW.toISOString());
  });
});

describe("loadDashboardVisitRecap -- render->marker race safety (13, 15)", () => {
  it("13. visitStartedAt is the server snapshot instant -- this function itself never writes the visit timestamp", async () => {
    await loadDashboardVisitRecap(NOW);
    // No writer is imported/mocked at all in this test file -- if the
    // read model ever called a write path, importing this module would
    // need a mock for it, and none exists. The return value itself is
    // proof of the read-only contract.
    expect(getLastVisitedAt).toHaveBeenCalledTimes(1);
  });

  it("15. visitStartedAt equals the passed-in `now`, never a later instant -- a change settling after this snapshot stays eligible for the NEXT visit", async () => {
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.visitStartedAt).toBe(NOW.toISOString());
  });
});

describe("loadDashboardVisitRecap -- category filtering (10)", () => {
  it("requests exactly the personal semantic-change categories (shift/team/duty)", async () => {
    await loadDashboardVisitRecap(NOW);
    const [, categories] = getRecentSettledJobsForRecipient.mock.calls[0];
    expect(new Set(categories)).toEqual(new Set(["shift_change", "team_change", "duty_change"]));
  });

  it("never requests coverage_gap or any reminder category", async () => {
    await loadDashboardVisitRecap(NOW);
    const [, categories] = getRecentSettledJobsForRecipient.mock.calls[0];
    for (const excluded of ["coverage_gap", "tomorrow_shift", "tomorrow_duty", "tomorrow_logistics_withdrawal", "constraints_sunday", "constraints_monday"]) {
      expect(categories).not.toContain(excluded);
    }
  });

  it("defensively drops a row whose category the store layer returned outside the requested set", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(jobsResult([job({ category: "coverage_gap" })]));
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items).toEqual([]);
  });
});

describe("loadDashboardVisitRecap -- safe presentation model", () => {
  it("never exposes internal notification-engine fields", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(jobsResult([job()]));
    const result = await loadDashboardVisitRecap(NOW);
    expect(Object.keys(result.items[0]).sort()).toEqual(["body", "category", "date", "happenedAt", "href", "key", "title"]);
  });

  it("maps category strings to the short presentation category", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(
      jobsResult([
        job({ id: "s", category: "shift_change" }),
        job({ id: "t", category: "team_change", sourceRef: "team:p_ilay:2026-08-20:night" }),
        job({ id: "d", category: "duty_change", sourceRef: "duty:p_ilay:2026-08-21" }),
      ]),
    );
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items.map((c) => c.category)).toEqual(["shift", "team", "duty"]);
  });

  it("preserves the store layer's newest-first ordering (never re-sorts)", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(
      jobsResult([job({ id: "newest", createdAt: "2026-08-25T09:00:00.000Z" }), job({ id: "older", createdAt: "2026-08-24T21:00:00.000Z" })]),
    );
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items.map((change) => change.key)).toEqual(["change:newest", "change:older"]);
  });
});

describe("loadDashboardVisitRecap -- navigation / deep links (23)", () => {
  it("a valid shift source_ref produces the /schedule?date=... deep link", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(jobsResult([job({ category: "shift_change", sourceRef: "shift:p_ilay:2026-08-19" })]));
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items[0].href).toBe("/schedule?date=2026-08-19");
    expect(result.items[0].date).toBe("2026-08-19");
  });

  it("a valid team source_ref produces the /schedule?date=... deep link", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(jobsResult([job({ category: "team_change", sourceRef: "team:p_ilay:2026-08-22:night" })]));
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items[0].href).toBe("/schedule?date=2026-08-22");
    expect(result.items[0].date).toBe("2026-08-22");
  });

  it("a malformed team source_ref falls back to the canonical / destination", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(jobsResult([job({ category: "team_change", sourceRef: "team:p_ilay:not-a-date:night" })]));
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items[0].href).toBe("/");
    expect(result.items[0].date).toBeNull();
  });

  it("a null source_ref falls back to the canonical shift destination", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(jobsResult([job({ category: "shift_change", sourceRef: null })]));
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items[0].href).toBe("/schedule");
    expect(result.items[0].date).toBeNull();
  });

  it("duty changes always use the canonical /duties destination, even with a parseable date", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(jobsResult([job({ category: "duty_change", sourceRef: "duty:p_ilay:2026-08-21" })]));
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items[0].href).toBe("/duties");
  });

  it("never lets a hostile source_ref reach the href -- only a validated YYYY-MM-DD, or the safe fallback", async () => {
    getRecentSettledJobsForRecipient.mockResolvedValue(
      jobsResult([job({ category: "shift_change", sourceRef: "shift:p_ilay:javascript:alert(1)" })]),
    );
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items[0].href).toBe("/schedule");
    expect(result.items[0].href).not.toContain("javascript");
    expect(result.items[0].date).toBeNull();
  });
});

describe("loadDashboardVisitRecap -- failure behavior (16, 29)", () => {
  it("a notification_jobs query failure never throws -- resolves to an empty recap, but visitStartedAt is still populated", async () => {
    getRecentSettledJobsForRecipient.mockRejectedValue(new Error("supabase down"));
    const result = await loadDashboardVisitRecap(NOW);
    expect(result).toEqual({ visitStartedAt: NOW.toISOString(), items: [], totalCount: 0 });
    expect(consoleErrorSpy).toHaveBeenCalledWith("[dashboard] visit recap query failed");
  });

  it("a visit-state read failure never throws -- resolves to an empty recap, but visitStartedAt is still populated", async () => {
    getLastVisitedAt.mockRejectedValue(new Error("db down"));
    const result = await loadDashboardVisitRecap(NOW);
    expect(result).toEqual({ visitStartedAt: NOW.toISOString(), items: [], totalCount: 0 });
    expect(consoleErrorSpy).toHaveBeenCalledWith("[dashboard] visit recap query failed");
  });

  it("an auth-resolution failure never throws -- resolves to an empty recap", async () => {
    getAuthenticatedIdentity.mockRejectedValue(new Error("auth down"));
    const result = await loadDashboardVisitRecap(NOW);
    expect(result.items).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[dashboard] visit recap query failed");
  });

  it("never logs error details (PII-safe fixed string only)", async () => {
    getRecentSettledJobsForRecipient.mockRejectedValue(new Error("some sensitive db detail"));
    await loadDashboardVisitRecap(NOW);
    expect(consoleErrorSpy.mock.calls[0]).toEqual(["[dashboard] visit recap query failed"]);
  });
});
