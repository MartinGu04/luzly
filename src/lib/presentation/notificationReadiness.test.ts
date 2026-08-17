import { describe, expect, it } from "vitest";
import type { ManagerNotificationReadinessState, ManagerNotificationReadinessView } from "@/lib/readModels/managerTypes";
import { buildNotificationReadinessSummary } from "./notificationReadiness";

function view(overrides: Partial<ManagerNotificationReadinessView> = {}): ManagerNotificationReadinessView {
  return { readyCount: 0, totalCount: 0, blockers: [], ...overrides };
}

function available(overrides: Partial<ManagerNotificationReadinessView> = {}): ManagerNotificationReadinessState {
  return { status: "available", view: view(overrides) };
}

describe("buildNotificationReadinessSummary — three distinct states", () => {
  it("skipped -- hidden (the lookup was never attempted)", () => {
    expect(buildNotificationReadinessSummary({ status: "skipped" })).toEqual({ kind: "hidden" });
  });

  it("available with zero blockers -- hidden, no permanent success card (never conflated with unavailable)", () => {
    expect(buildNotificationReadinessSummary(available({ readyCount: 3, totalCount: 3, blockers: [] }))).toEqual({
      kind: "hidden",
    });
  });

  it("unavailable -- its own distinct kind, never hidden and never conflated with all-ready", () => {
    expect(buildNotificationReadinessSummary({ status: "unavailable" })).toEqual({ kind: "unavailable" });
  });
});

describe("buildNotificationReadinessSummary — blockers view", () => {
  it("singular summary sentence for exactly one blocker", () => {
    const result = buildNotificationReadinessSummary(
      available({ blockers: [{ personId: "p1", personName: "דנה", status: "missing_email" }] }),
    );
    expect(result).toMatchObject({ kind: "blockers", summary: "אדם אחד עדיין לא יכול לקבל התראות אישיות" });
  });

  it("plural summary sentence with the exact count for multiple blockers", () => {
    const result = buildNotificationReadinessSummary(
      available({
        blockers: [
          { personId: "p1", personName: "דנה", status: "missing_email" },
          { personId: "p2", personName: "עידו", status: "no_push_subscription" },
        ],
      }),
    );
    expect(result).toMatchObject({ kind: "blockers", summary: "2 אנשים עדיין לא יכולים לקבל התראות אישיות" });
  });

  it("groups by status with the exact required Hebrew labels", () => {
    const result = buildNotificationReadinessSummary(
      available({
        blockers: [
          { personId: "p1", personName: "דנה", status: "missing_email" },
          { personId: "p2", personName: "עידו", status: "ambiguous_email" },
          { personId: "p3", personName: "רון", status: "unmapped_account" },
          { personId: "p4", personName: "מאיה", status: "no_push_subscription" },
        ],
      }),
    );

    expect(result.kind).toBe("blockers");
    if (result.kind !== "blockers") return;
    expect(result.groups).toEqual([
      { status: "missing_email", label: "חסר מייל בכ״א", personNames: ["דנה"] },
      { status: "ambiguous_email", label: "מייל משויך ליותר מאדם אחד", personNames: ["עידו"] },
      { status: "unmapped_account", label: "לא נמצא חשבון מערכת תואם", personNames: ["רון"] },
      { status: "no_push_subscription", label: "אין מכשיר רשום להתראות", personNames: ["מאיה"] },
    ]);
  });

  it("omits statuses with zero people rather than rendering an empty group", () => {
    const result = buildNotificationReadinessSummary(
      available({ blockers: [{ personId: "p1", personName: "דנה", status: "no_push_subscription" }] }),
    );

    expect(result.kind).toBe("blockers");
    if (result.kind !== "blockers") return;
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].status).toBe("no_push_subscription");
  });

  it("groups multiple people under the same status, preserving the read model's own name order", () => {
    const result = buildNotificationReadinessSummary(
      available({
        blockers: [
          { personId: "p1", personName: "אבי", status: "missing_email" },
          { personId: "p2", personName: "בני", status: "missing_email" },
        ],
      }),
    );

    expect(result.kind).toBe("blockers");
    if (result.kind !== "blockers") return;
    expect(result.groups).toEqual([{ status: "missing_email", label: "חסר מייל בכ״א", personNames: ["אבי", "בני"] }]);
  });

  it("never exposes personId or any other field beyond label/personNames in the built view", () => {
    const result = buildNotificationReadinessSummary(
      available({ blockers: [{ personId: "p1", personName: "דנה", status: "missing_email" }] }),
    );

    expect(JSON.stringify(result)).not.toContain("p1");
  });
});
