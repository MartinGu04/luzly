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

  it("the bottom-nav set stays at exactly five items regardless of manager status", () => {
    for (const isManager of [true, false]) {
      const bottomNavCount = visibleNavItems(isManager).filter((item) => item.inBottomNav).length;
      expect(bottomNavCount).toBe(5);
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

  it('"תזכורות" remains as the existing disabled future placeholder', () => {
    const reminders = navItems.find((item) => item.href === "/reminders");
    expect(reminders).toBeDefined();
    expect(reminders?.label).toBe("תזכורות");
    expect(reminders?.enabled).toBe(false);
  });

  it("every other enabled route is unchanged", () => {
    const enabledHrefs = navItems.filter((item) => item.enabled).map((item) => item.href);
    expect(enabledHrefs).toEqual(["/", "/schedule", "/duties", "/with-me", "/conflicts", "/manager"]);
  });

  it("manager visibility rules are unchanged", () => {
    const manager = navItems.find((item) => item.href === "/manager");
    expect(manager?.managerOnly).toBe(true);
    expect(visibleNavItems(false).some((item) => item.href === "/manager")).toBe(false);
    expect(visibleNavItems(true).some((item) => item.href === "/manager")).toBe(true);
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
