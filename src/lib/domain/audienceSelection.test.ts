import { describe, expect, it } from "vitest";
import type { AudienceGroupable } from "./audienceGroups";
import {
  ALL_ELIGIBLE_AUDIENCE_SELECTION,
  personMatchesAudienceSelection,
  resolveNotificationAudience,
  type NotificationAudienceSelection,
} from "./audienceSelection";

function person(overrides: Partial<AudienceGroupable> & { id: string }): AudienceGroupable {
  return {
    personnelType: null,
    isSupervisor: false,
    isTechnician: false,
    ...overrides,
  };
}

function selection(overrides: Partial<NotificationAudienceSelection> = {}): NotificationAudienceSelection {
  return { ...ALL_ELIGIBLE_AUDIENCE_SELECTION, ...overrides };
}

describe("resolveNotificationAudience -- all_eligible", () => {
  it("returns every eligible person unchanged when nothing is excluded", () => {
    const people = [person({ id: "p1" }), person({ id: "p2" })];
    expect(resolveNotificationAudience(people, selection()).map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

describe("resolveNotificationAudience -- groups", () => {
  it("resolves service-type groups", () => {
    const people = [
      person({ id: "p1", personnelType: "קבע" }),
      person({ id: "p2", personnelType: "חובה" }),
      person({ id: "p3", personnelType: "מילואים" }),
    ];
    const result = resolveNotificationAudience(people, selection({ mode: "groups", groupKeys: ["regular"] }));
    expect(result.map((p) => p.id)).toEqual(["p2"]);
  });

  it("resolves role groups", () => {
    const people = [
      person({ id: "p1", isSupervisor: true }),
      person({ id: "p2", isTechnician: true }),
      person({ id: "p3" }),
    ];
    const result = resolveNotificationAudience(people, selection({ mode: "groups", groupKeys: ["technician"] }));
    expect(result.map((p) => p.id)).toEqual(["p2"]);
  });

  it("unions multiple selected groups correctly", () => {
    const people = [
      person({ id: "p1", personnelType: "קבע" }),
      person({ id: "p2", isSupervisor: true, personnelType: "חובה" }),
      person({ id: "p3", personnelType: "חובה" }),
    ];
    const result = resolveNotificationAudience(people, selection({ mode: "groups", groupKeys: ["permanent", "supervisor"] }));
    expect(result.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });
});

describe("resolveNotificationAudience -- people", () => {
  it("targets exactly the specific selected people, intersected with eligibility", () => {
    const people = [person({ id: "p1" }), person({ id: "p2" }), person({ id: "p3" })];
    const result = resolveNotificationAudience(people, selection({ mode: "people", personIds: ["p1", "p3", "not-eligible"] }));
    expect(result.map((p) => p.id)).toEqual(["p1", "p3"]);
  });
});

describe("resolveNotificationAudience -- exclusions always win", () => {
  it("removes an excluded person even under all_eligible", () => {
    const people = [person({ id: "p1" }), person({ id: "p2" })];
    const result = resolveNotificationAudience(people, selection({ excludedPersonIds: ["p1"] }));
    expect(result.map((p) => p.id)).toEqual(["p2"]);
  });

  it("removes an excluded person even when directly selected via 'people' mode", () => {
    const people = [person({ id: "p1" }), person({ id: "p2" })];
    const result = resolveNotificationAudience(
      people,
      selection({ mode: "people", personIds: ["p1", "p2"], excludedPersonIds: ["p1"] }),
    );
    expect(result.map((p) => p.id)).toEqual(["p2"]);
  });

  it("removes an excluded person who belongs to multiple selected groups", () => {
    const multiGroup = person({ id: "p1", personnelType: "מילואים", isSupervisor: true, isTechnician: true });
    const other = person({ id: "p2", personnelType: "מילואים" });
    const result = resolveNotificationAudience(
      [multiGroup, other],
      selection({ mode: "groups", groupKeys: ["reserve", "supervisor", "technician"], excludedPersonIds: ["p1"] }),
    );
    expect(result.map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("resolveNotificationAudience -- dedup and narrow-only", () => {
  it("deduplicates recipients by canonical id even if the input repeats an id", () => {
    const people = [person({ id: "p1" }), person({ id: "p1" }), person({ id: "p2" })];
    const result = resolveNotificationAudience(people, selection());
    expect(result.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("can never broaden eligibility -- selecting a group with zero members in the eligible set yields zero recipients", () => {
    // Simulates a system notification whose domain-eligible candidates are
    // already narrowed (e.g. non-permanent-only) BEFORE the resolver runs:
    // no permanent person is even present in `eligiblePeople`, so selecting
    // the permanent group here can never conjure one into the result.
    const nonPermanentOnly = [person({ id: "p1", personnelType: "חובה" }), person({ id: "p2", personnelType: "מילואים" })];
    const result = resolveNotificationAudience(nonPermanentOnly, selection({ mode: "groups", groupKeys: ["permanent"] }));
    expect(result).toEqual([]);
  });

  it("can never broaden eligibility -- 'all_eligible' and explicit person selection are still bounded by eligiblePeople", () => {
    const eligible = [person({ id: "p1" })];
    expect(resolveNotificationAudience(eligible, selection()).map((p) => p.id)).toEqual(["p1"]);
    expect(
      resolveNotificationAudience(eligible, selection({ mode: "people", personIds: ["p1", "p2", "p3"] })).map((p) => p.id),
    ).toEqual(["p1"]);
  });
});

describe("personMatchesAudienceSelection", () => {
  it("matches the array resolver's own per-person decision", () => {
    const p = person({ id: "p1", personnelType: "חובה" });
    const sel = selection({ mode: "groups", groupKeys: ["regular"] });
    expect(personMatchesAudienceSelection(p, sel)).toBe(true);
    expect(personMatchesAudienceSelection(p, { ...sel, excludedPersonIds: ["p1"] })).toBe(false);
  });
});
