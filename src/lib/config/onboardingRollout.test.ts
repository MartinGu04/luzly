import { describe, expect, it } from "vitest";
import { isEligibleForOnboarding, ONBOARDING_ROLLOUT_CUTOFF } from "./onboardingRollout";

describe("isEligibleForOnboarding — rollout cutoff boundary", () => {
  it("an account created well before the cutoff is not eligible (veteran)", () => {
    expect(isEligibleForOnboarding("2020-01-01T00:00:00.000Z")).toBe(false);
  });

  it("an account created exactly at the cutoff is eligible", () => {
    expect(isEligibleForOnboarding(ONBOARDING_ROLLOUT_CUTOFF)).toBe(true);
  });

  it("an account created one millisecond before the cutoff is not eligible", () => {
    const justBefore = new Date(Date.parse(ONBOARDING_ROLLOUT_CUTOFF) - 1).toISOString();
    expect(isEligibleForOnboarding(justBefore)).toBe(false);
  });

  it("an account created one millisecond after the cutoff is eligible", () => {
    const justAfter = new Date(Date.parse(ONBOARDING_ROLLOUT_CUTOFF) + 1).toISOString();
    expect(isEligibleForOnboarding(justAfter)).toBe(true);
  });

  it("an account created well after the cutoff is eligible", () => {
    expect(isEligibleForOnboarding("2027-01-01T00:00:00.000Z")).toBe(true);
  });
});

describe("isEligibleForOnboarding — fails closed on missing/invalid input", () => {
  it("undefined is never eligible -- unknown account age must never be treated as new", () => {
    expect(isEligibleForOnboarding(undefined)).toBe(false);
  });

  it("null is never eligible", () => {
    expect(isEligibleForOnboarding(null)).toBe(false);
  });

  it("an empty string is never eligible", () => {
    expect(isEligibleForOnboarding("")).toBe(false);
  });

  it("a malformed/garbage timestamp is never eligible, never throws", () => {
    expect(() => isEligibleForOnboarding("not-a-date")).not.toThrow();
    expect(isEligibleForOnboarding("not-a-date")).toBe(false);
  });
});
