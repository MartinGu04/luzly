import { describe, expect, it } from "vitest";
import { navItems, visibleNavItems } from "./nav-items";

describe("visibleNavItems", () => {
  it("hides the manager-only item entirely for a non-manager", () => {
    const items = visibleNavItems(false);
    expect(items.some((item) => item.href === "/manager")).toBe(false);
  });

  it("shows the manager-only item for a manager", () => {
    const items = visibleNavItems(true);
    expect(items.some((item) => item.href === "/manager")).toBe(true);
  });

  it("never hides a non-manager-only item, for either viewer", () => {
    const nonManagerOnly = navItems.filter((item) => !item.managerOnly);
    for (const isManager of [true, false]) {
      const hrefs = visibleNavItems(isManager).map((item) => item.href);
      for (const item of nonManagerOnly) {
        expect(hrefs).toContain(item.href);
      }
    }
  });

  it("/manager is enabled and NOT part of the mobile bottom nav", () => {
    const manager = navItems.find((item) => item.href === "/manager");
    expect(manager?.enabled).toBe(true);
    expect(manager?.inBottomNav).toBe(false);
  });

  it("the bottom-nav set stays at exactly three items regardless of manager status", () => {
    for (const isManager of [true, false]) {
      const bottomNavCount = visibleNavItems(isManager).filter((item) => item.inBottomNav).length;
      expect(bottomNavCount).toBe(3);
    }
  });
});

describe("navItems — obsolete sync placeholder removed (PR #18)", () => {
  it('"סנכרון" is not in navItems anymore', () => {
    expect(navItems.some((item) => item.label === "סנכרון" || item.shortLabel === "סנכרון")).toBe(false);
  });

  it('"/sync" is not in navItems anymore', () => {
    expect(navItems.some((item) => item.href === "/sync")).toBe(false);
  });

  it("every other enabled route is unchanged", () => {
    const enabledHrefs = navItems.filter((item) => item.enabled).map((item) => item.href);
    expect(enabledHrefs).toEqual(["/", "/schedule", "/duties", "/manager"]);
  });

  it("manager visibility rules are unchanged", () => {
    const manager = navItems.find((item) => item.href === "/manager");
    expect(manager?.managerOnly).toBe(true);
    expect(visibleNavItems(false).some((item) => item.href === "/manager")).toBe(false);
    expect(visibleNavItems(true).some((item) => item.href === "/manager")).toBe(true);
  });
});

describe("navItems — \"תזכורות\" removed (sidebar/mobile-nav refinement pass)", () => {
  it('"תזכורות" is not in navItems anymore -- that area now belongs to the notification bell flow', () => {
    expect(navItems.some((item) => item.label === "תזכורות" || item.shortLabel === "תזכורות")).toBe(false);
  });

  it('"/reminders" is not in navItems anymore', () => {
    expect(navItems.some((item) => item.href === "/reminders")).toBe(false);
  });

  it("no navItems entry is disabled -- every current item is a real, live link", () => {
    expect(navItems.every((item) => item.enabled)).toBe(true);
  });
});

describe("navItems — manager nav label rename (Design Pass, PR #19)", () => {
  it('the /manager nav label is "אזור מנהל", not the old "מול מנהל"', () => {
    const manager = navItems.find((item) => item.href === "/manager");
    expect(manager?.label).toBe("אזור מנהל");
  });

  it("the /manager route itself is unchanged -- this is a wording-only rename", () => {
    const manager = navItems.find((item) => item.label === "אזור מנהל");
    expect(manager?.href).toBe("/manager");
  });
});

describe("navItems — \"מי איתי\" and \"התנגשויות\" removed as standalone destinations (nav/people-selector consolidation pass)", () => {
  it('"מי איתי" / "/with-me" is not in navItems anymore -- it stays only as the existing dashboard presentation', () => {
    expect(navItems.some((item) => item.href === "/with-me")).toBe(false);
    expect(navItems.some((item) => item.label === "מי איתי" || item.shortLabel === "מי איתי")).toBe(false);
  });

  it('"התנגשויות" / "/conflicts" is not in navItems anymore -- conflict/coverage detection now surfaces via the manager\'s "דורש טיפול" section', () => {
    expect(navItems.some((item) => item.href === "/conflicts")).toBe(false);
    expect(navItems.some((item) => item.label === "התנגשויות" || item.shortLabel === "התנגשויות")).toBe(false);
  });

  it("no navItems entry is disabled -- every remaining item is a real, live link", () => {
    expect(navItems.every((item) => item.enabled)).toBe(true);
  });
});
