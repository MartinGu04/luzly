import { describe, expect, it } from "vitest";
import type { ManagerNotificationReadinessView } from "@/lib/readModels/managerTypes";
import { buildNotificationReadinessSummary } from "./notificationReadiness";

function view(overrides: Partial<ManagerNotificationReadinessView> = {}): ManagerNotificationReadinessView {
  return { readyCount: 0, totalCount: 0, blockers: [], ...overrides };
}

describe("buildNotificationReadinessSummary", () => {
  it("returns null when the readiness lookup was skipped/failed (view is null)", () => {
    expect(buildNotificationReadinessSummary(null)).toBeNull();
  });

  it("returns null when everyone is ready -- no permanent success card", () => {
    expect(buildNotificationReadinessSummary(view({ readyCount: 3, totalCount: 3, blockers: [] }))).toBeNull();
  });

  it("singular summary sentence for exactly one blocker", () => {
    const result = buildNotificationReadinessSummary(
      view({ blockers: [{ personId: "p1", personName: "דנה", status: "missing_email" }] }),
    );
    expect(result?.summary).toBe("אדם אחד עדיין לא יכול לקבל התראות אישיות");
  });

  it("plural summary sentence with the exact count for multiple blockers", () => {
    const result = buildNotificationReadinessSummary(
      view({
        blockers: [
          { personId: "p1", personName: "דנה", status: "missing_email" },
          { personId: "p2", personName: "עידו", status: "no_push_subscription" },
        ],
      }),
    );
    expect(result?.summary).toBe("2 אנשים עדיין לא יכולים לקבל התראות אישיות");
  });

  it("groups by status with the exact required Hebrew labels", () => {
    const result = buildNotificationReadinessSummary(
      view({
        blockers: [
          { personId: "p1", personName: "דנה", status: "missing_email" },
          { personId: "p2", personName: "עידו", status: "ambiguous_email" },
          { personId: "p3", personName: "רון", status: "unmapped_account" },
          { personId: "p4", personName: "מאיה", status: "no_push_subscription" },
        ],
      }),
    );

    expect(result?.groups).toEqual([
      { status: "missing_email", label: "חסר מייל בכ״א", personNames: ["דנה"] },
      { status: "ambiguous_email", label: "מייל משויך ליותר מאדם אחד", personNames: ["עידו"] },
      { status: "unmapped_account", label: "לא נמצא חשבון מערכת תואם", personNames: ["רון"] },
      { status: "no_push_subscription", label: "אין מכשיר רשום להתראות", personNames: ["מאיה"] },
    ]);
  });

  it("omits statuses with zero people rather than rendering an empty group", () => {
    const result = buildNotificationReadinessSummary(
      view({ blockers: [{ personId: "p1", personName: "דנה", status: "no_push_subscription" }] }),
    );

    expect(result?.groups).toHaveLength(1);
    expect(result?.groups[0].status).toBe("no_push_subscription");
  });

  it("groups multiple people under the same status, preserving the read model's own name order", () => {
    const result = buildNotificationReadinessSummary(
      view({
        blockers: [
          { personId: "p1", personName: "אבי", status: "missing_email" },
          { personId: "p2", personName: "בני", status: "missing_email" },
        ],
      }),
    );

    expect(result?.groups).toEqual([{ status: "missing_email", label: "חסר מייל בכ״א", personNames: ["אבי", "בני"] }]);
  });

  it("never exposes personId or any other field beyond label/personNames in the built view", () => {
    const result = buildNotificationReadinessSummary(
      view({ blockers: [{ personId: "p1", personName: "דנה", status: "missing_email" }] }),
    );

    expect(JSON.stringify(result)).not.toContain("p1");
  });
});
