import { describe, expect, it } from "vitest";
import type { ManagerAdoptionPersonView } from "@/lib/readModels/managerTypes";
import { computeAudienceSummary, unresolvedReasonLabel } from "./managerBroadcast";

function adoption(overrides: Partial<ManagerAdoptionPersonView> & Pick<ManagerAdoptionPersonView, "personId">): ManagerAdoptionPersonView {
  return {
    personName: "אדם",
    avatarUrl: null,
    loginStatus: null,
    notificationStatus: null,
    dataIssue: null,
    needsNudge: false,
    ...overrides,
  };
}

describe("computeAudienceSummary", () => {
  it("counts a ready person as push-capable", () => {
    const map = new Map([["p1", adoption({ personId: "p1", loginStatus: "logged_in", notificationStatus: "ready" })]]);
    const summary = computeAudienceSummary(["p1"], map);
    expect(summary).toEqual({ selectedCount: 1, pushCapableCount: 1, inboxOnlyCount: 0, unresolvedCount: 0 });
  });

  it("counts a logged-in, not-enabled person as inbox-only", () => {
    const map = new Map([["p1", adoption({ personId: "p1", loginStatus: "logged_in", notificationStatus: "not_enabled" })]]);
    const summary = computeAudienceSummary(["p1"], map);
    expect(summary).toEqual({ selectedCount: 1, pushCapableCount: 0, inboxOnlyCount: 1, unresolvedCount: 0 });
  });

  it("counts a data-issue person as unresolved", () => {
    const map = new Map([["p1", adoption({ personId: "p1", dataIssue: "missing_email" })]]);
    const summary = computeAudienceSummary(["p1"], map);
    expect(summary).toEqual({ selectedCount: 1, pushCapableCount: 0, inboxOnlyCount: 0, unresolvedCount: 1 });
  });

  it("counts a not-logged-in person as unresolved", () => {
    const map = new Map([["p1", adoption({ personId: "p1", loginStatus: "not_logged_in" })]]);
    const summary = computeAudienceSummary(["p1"], map);
    expect(summary).toEqual({ selectedCount: 1, pushCapableCount: 0, inboxOnlyCount: 0, unresolvedCount: 1 });
  });

  it("counts a selected person absent from the adoption map as unresolved -- never silently dropped", () => {
    const summary = computeAudienceSummary(["p_unknown"], new Map());
    expect(summary).toEqual({ selectedCount: 1, pushCapableCount: 0, inboxOnlyCount: 0, unresolvedCount: 1 });
  });

  it("a mixed selection tallies each bucket independently, and selectedCount is always the raw input length", () => {
    const map = new Map([
      ["p1", adoption({ personId: "p1", loginStatus: "logged_in", notificationStatus: "ready" })],
      ["p2", adoption({ personId: "p2", loginStatus: "logged_in", notificationStatus: "not_enabled" })],
      ["p3", adoption({ personId: "p3", dataIssue: "ambiguous_email" })],
    ]);
    const summary = computeAudienceSummary(["p1", "p2", "p3", "p_missing"], map);
    expect(summary).toEqual({ selectedCount: 4, pushCapableCount: 1, inboxOnlyCount: 1, unresolvedCount: 2 });
  });

  it("an empty selection is all zeros", () => {
    expect(computeAudienceSummary([], new Map())).toEqual({
      selectedCount: 0,
      pushCapableCount: 0,
      inboxOnlyCount: 0,
      unresolvedCount: 0,
    });
  });
});

describe("unresolvedReasonLabel", () => {
  it("labels a missing-email data issue", () => {
    expect(unresolvedReasonLabel(adoption({ personId: "p1", dataIssue: "missing_email" }))).toBe("חסר מייל בכ״א");
  });

  it("labels an ambiguous-email data issue", () => {
    expect(unresolvedReasonLabel(adoption({ personId: "p1", dataIssue: "ambiguous_email" }))).toBe(
      "מייל משויך ליותר מאדם אחד",
    );
  });

  it("labels a not-logged-in person", () => {
    expect(unresolvedReasonLabel(adoption({ personId: "p1", loginStatus: "not_logged_in" }))).toBe(
      "טרם נכנס/ה למערכת",
    );
  });

  it("returns null for a ready/not_enabled person -- no warning label needed", () => {
    expect(unresolvedReasonLabel(adoption({ personId: "p1", loginStatus: "logged_in", notificationStatus: "ready" }))).toBeNull();
    expect(
      unresolvedReasonLabel(adoption({ personId: "p1", loginStatus: "logged_in", notificationStatus: "not_enabled" })),
    ).toBeNull();
  });
});
