import { describe, expect, it } from "vitest";
import type { Person } from "@/lib/domain/types";
import type { PersonReadinessResult } from "@/lib/notifications/engine/readiness";
import { buildManagerRoster, toManagerAdoptionState } from "./managerAdoptionProjection";

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_x",
    name: "שם",
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

describe("buildManagerRoster", () => {
  it("projects Person[] down to the manager-safe summary, never leaking email", () => {
    const roster = buildManagerRoster([person({ id: "p1", name: "דנה", email: "dana@example.invalid" })]);
    expect(roster).toEqual([{ id: "p1", name: "דנה", isManager: false, isTechnician: false, isSupervisor: false, personnelType: null }]);
    expect(JSON.stringify(roster)).not.toContain("dana@example.invalid");
  });

  it("sorts by name, then id as a stable tiebreak", () => {
    const roster = buildManagerRoster([
      person({ id: "p_b", name: "ב" }),
      person({ id: "p_a2", name: "א" }),
      person({ id: "p_a1", name: "א" }),
    ]);
    expect(roster.map((p) => p.id)).toEqual(["p_a1", "p_a2", "p_b"]);
  });
});

describe("toManagerAdoptionState", () => {
  const PEOPLE_BY_ID = new Map<string, Person>([["p1", person({ id: "p1", name: "דנה" })]]);

  it("skipped/unavailable pass straight through, never conflated with each other", () => {
    expect(toManagerAdoptionState({ status: "skipped" }, PEOPLE_BY_ID)).toEqual({ status: "skipped" });
    expect(toManagerAdoptionState({ status: "unavailable" }, PEOPLE_BY_ID)).toEqual({ status: "unavailable" });
  });

  it("ok narrows into the available view, splitting readiness into loginStatus/notificationStatus/dataIssue", () => {
    const results: PersonReadinessResult[] = [{ personId: "p1", status: "ready", avatarUrl: "https://example.invalid/p1.jpg" }];
    const state = toManagerAdoptionState({ status: "ok", results }, PEOPLE_BY_ID);
    expect(state.status).toBe("available");
    if (state.status !== "available") return;
    expect(state.view.people).toEqual([
      {
        personId: "p1",
        personName: "דנה",
        avatarUrl: "https://example.invalid/p1.jpg",
        loginStatus: "logged_in",
        notificationStatus: "ready",
        dataIssue: null,
        needsNudge: false,
      },
    ]);
    expect(state.view.summary.totalCount).toBe(1);
  });

  it("a missing_email/ambiguous_email result carries a dataIssue, never a loginStatus guess", () => {
    const results: PersonReadinessResult[] = [{ personId: "p1", status: "missing_email", avatarUrl: null }];
    const state = toManagerAdoptionState({ status: "ok", results }, PEOPLE_BY_ID);
    expect(state.status).toBe("available");
    if (state.status !== "available") return;
    expect(state.view.people[0].dataIssue).toBe("missing_email");
    expect(state.view.people[0].loginStatus).toBeNull();
  });
});
