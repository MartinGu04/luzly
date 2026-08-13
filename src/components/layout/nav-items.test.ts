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
