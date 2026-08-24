import { describe, expect, it } from "vitest";
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
    ...overrides,
  };
}

describe("isSystemRulePersonAllowed -- the ONE audience-filter helper every system reminder category applies on top of its own domain eligibility", () => {
  it("'all_eligible' allows every person id -- current/default behavior, never itself a source of eligibility", () => {
    expect(isSystemRulePersonAllowed(rule({ audienceMode: "all_eligible" }), "p_anyone")).toBe(true);
    expect(isSystemRulePersonAllowed(rule({ audienceMode: "all_eligible", targetPersonIds: [] }), "p_anyone")).toBe(true);
  });

  it("'selected' allows only a person id present in targetPersonIds", () => {
    const selectedRule = rule({ audienceMode: "selected", targetPersonIds: ["p_a", "p_b"] });
    expect(isSystemRulePersonAllowed(selectedRule, "p_a")).toBe(true);
    expect(isSystemRulePersonAllowed(selectedRule, "p_b")).toBe(true);
    expect(isSystemRulePersonAllowed(selectedRule, "p_c")).toBe(false);
  });

  it("'selected' with an empty targetPersonIds allows no one -- fail-safe, never silently falls back to all_eligible", () => {
    expect(isSystemRulePersonAllowed(rule({ audienceMode: "selected", targetPersonIds: [] }), "p_a")).toBe(false);
  });

  it("is a pure FILTER only -- it has no notion of domain eligibility itself; callers must apply it on top of their own eligible-recipient computation", () => {
    // Selecting a person id that no domain computation would ever have
    // produced is harmless here in isolation -- this helper alone cannot
    // grant them the notification; only a caller who ALSO independently
    // decided this personId is domain-eligible would ever act on this
    // `true`. See reminders.test.ts's own per-category audience-filter
    // tests for the end-to-end proof that a selected-but-domain-ineligible
    // person never actually receives anything.
    expect(isSystemRulePersonAllowed(rule({ audienceMode: "selected", targetPersonIds: ["p_not_actually_eligible"] }), "p_not_actually_eligible")).toBe(
      true,
    );
  });
});
