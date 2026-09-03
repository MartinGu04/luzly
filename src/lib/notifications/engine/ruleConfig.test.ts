import { describe, expect, it } from "vitest";
import type { Person } from "@/lib/domain/types";
import { isSystemRulePersonAllowed, type SystemRuleConfig } from "./ruleConfig";

function rule(overrides: Partial<SystemRuleConfig> = {}): SystemRuleConfig {
  return {
    id: "rule-1",
    systemKey: "tomorrow_shift",
    enabled: true,
    localHour: 20,
    localMinute: 0,
    revision: 1,
    titleOverride: null,
    bodyOverride: null,
    audienceMode: "all_eligible",
    targetPersonIds: [],
    audienceGroupKeys: [],
    excludedPersonIds: [],
    ...overrides,
  };
}

function person(overrides: Partial<Person> & { id: string }): Person {
  return {
    name: overrides.id,
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    dischargeDate: null,
    enlistmentDate: null,
    ...overrides,
  };
}

describe("isSystemRulePersonAllowed -- the ONE audience-filter helper every system reminder category applies on top of its own domain eligibility", () => {
  it("'all_eligible' allows every person id -- current/default behavior, never itself a source of eligibility", () => {
    expect(isSystemRulePersonAllowed(rule({ audienceMode: "all_eligible" }), "p_anyone", [])).toBe(true);
    expect(isSystemRulePersonAllowed(rule({ audienceMode: "all_eligible", targetPersonIds: [] }), "p_anyone", [])).toBe(true);
  });

  it("'selected' allows only a person id present in targetPersonIds", () => {
    const selectedRule = rule({ audienceMode: "selected", targetPersonIds: ["p_a", "p_b"] });
    expect(isSystemRulePersonAllowed(selectedRule, "p_a", [])).toBe(true);
    expect(isSystemRulePersonAllowed(selectedRule, "p_b", [])).toBe(true);
    expect(isSystemRulePersonAllowed(selectedRule, "p_c", [])).toBe(false);
  });

  it("'selected' with an empty targetPersonIds allows no one -- fail-safe, never silently falls back to all_eligible", () => {
    expect(isSystemRulePersonAllowed(rule({ audienceMode: "selected", targetPersonIds: [] }), "p_a", [])).toBe(false);
  });

  it("is a pure FILTER only -- it has no notion of domain eligibility itself; callers must apply it on top of their own eligible-recipient computation", () => {
    // Selecting a person id that no domain computation would ever have
    // produced is harmless here in isolation -- this helper alone cannot
    // grant them the notification; only a caller who ALSO independently
    // decided this personId is domain-eligible would ever act on this
    // `true`. See reminders.test.ts's own per-category audience-filter
    // tests for the end-to-end proof that a selected-but-domain-ineligible
    // person never actually receives anything.
    expect(
      isSystemRulePersonAllowed(rule({ audienceMode: "selected", targetPersonIds: ["p_not_actually_eligible"] }), "p_not_actually_eligible", []),
    ).toBe(true);
  });

  describe("'groups' -- dynamic audience groups", () => {
    const roster = [
      person({ id: "p_permanent", personnelType: "קבע" }),
      person({ id: "p_regular", personnelType: "חובה" }),
      person({ id: "p_reserve_supervisor", personnelType: "מילואים", isSupervisor: true }),
      person({ id: "p_technician", personnelType: "חובה", isTechnician: true }),
    ];

    it("resolves service-type groups", () => {
      const permanentRule = rule({ audienceMode: "groups", audienceGroupKeys: ["permanent"] });
      expect(isSystemRulePersonAllowed(permanentRule, "p_permanent", roster)).toBe(true);
      expect(isSystemRulePersonAllowed(permanentRule, "p_regular", roster)).toBe(false);
    });

    it("resolves role groups", () => {
      const supervisorRule = rule({ audienceMode: "groups", audienceGroupKeys: ["supervisor"] });
      expect(isSystemRulePersonAllowed(supervisorRule, "p_reserve_supervisor", roster)).toBe(true);
      expect(isSystemRulePersonAllowed(supervisorRule, "p_technician", roster)).toBe(false);
    });

    it("unions multiple selected groups correctly", () => {
      const unionRule = rule({ audienceMode: "groups", audienceGroupKeys: ["permanent", "technician"] });
      expect(isSystemRulePersonAllowed(unionRule, "p_permanent", roster)).toBe(true);
      expect(isSystemRulePersonAllowed(unionRule, "p_technician", roster)).toBe(true);
      expect(isSystemRulePersonAllowed(unionRule, "p_regular", roster)).toBe(false);
    });

    it("'groups' with nothing selected allows no one -- fail-safe, same as 'selected' with an empty list", () => {
      expect(isSystemRulePersonAllowed(rule({ audienceMode: "groups", audienceGroupKeys: [] }), "p_permanent", roster)).toBe(false);
    });

    it("a person id absent from the roster snapshot fails closed under 'groups' (can't verify membership) but 'all_eligible' is unaffected", () => {
      expect(isSystemRulePersonAllowed(rule({ audienceMode: "groups", audienceGroupKeys: ["permanent"] }), "p_unknown", roster)).toBe(false);
      expect(isSystemRulePersonAllowed(rule({ audienceMode: "all_eligible" }), "p_unknown", roster)).toBe(true);
    });
  });

  describe("excludedPersonIds -- 'לא לשלוח ל' always wins, independent of audienceMode", () => {
    it("excludes a person even under 'all_eligible'", () => {
      const excludingRule = rule({ audienceMode: "all_eligible", excludedPersonIds: ["p_excluded"] });
      expect(isSystemRulePersonAllowed(excludingRule, "p_excluded", [])).toBe(false);
      expect(isSystemRulePersonAllowed(excludingRule, "p_other", [])).toBe(true);
    });

    it("excludes a person even when directly selected via 'selected'", () => {
      const excludingRule = rule({ audienceMode: "selected", targetPersonIds: ["p_a"], excludedPersonIds: ["p_a"] });
      expect(isSystemRulePersonAllowed(excludingRule, "p_a", [])).toBe(false);
    });

    it("excludes a person who belongs to multiple selected groups", () => {
      const roster = [person({ id: "p_multi", personnelType: "מילואים", isSupervisor: true, isTechnician: true })];
      const excludingRule = rule({
        audienceMode: "groups",
        audienceGroupKeys: ["reserve", "supervisor", "technician"],
        excludedPersonIds: ["p_multi"],
      });
      expect(isSystemRulePersonAllowed(excludingRule, "p_multi", roster)).toBe(false);
    });
  });
});
