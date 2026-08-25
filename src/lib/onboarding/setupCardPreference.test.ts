import { afterEach, describe, expect, it, vi } from "vitest";
import { markSetupItemSkipped, readSkippedSetupItems } from "./setupCardPreference";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("setupCardPreference — storage isolation (per userId, never global)", () => {
  it("returns an empty set for a userId that has never skipped anything", () => {
    expect(readSkippedSetupItems("user-a").size).toBe(0);
  });

  it("stores under a key namespaced by userId, never a bare/global key", () => {
    markSetupItemSkipped("user-a", "install");
    expect(window.localStorage.getItem("mi-ma-mo:setup-card-skipped:user-a")).not.toBeNull();
    expect(window.localStorage.getItem("mi-ma-mo:setup-card-skipped:user-b")).toBeNull();
  });

  it("A skipping never affects B's own skip state", () => {
    markSetupItemSkipped("user-a", "install");
    expect(readSkippedSetupItems("user-a").has("install")).toBe(true);
    expect(readSkippedSetupItems("user-b").has("install")).toBe(false);
  });
});

describe("setupCardPreference — multiple items", () => {
  it("skipping one item never affects another item's state", () => {
    markSetupItemSkipped("user-a", "install");
    const skipped = readSkippedSetupItems("user-a");
    expect(skipped.has("install")).toBe(true);
    expect(skipped.has("notifications")).toBe(false);
    expect(skipped.has("calendar_sync")).toBe(false);
  });

  it("accumulates multiple skipped items for the same user", () => {
    markSetupItemSkipped("user-a", "install");
    markSetupItemSkipped("user-a", "notifications");
    const skipped = readSkippedSetupItems("user-a");
    expect(skipped.has("install")).toBe(true);
    expect(skipped.has("notifications")).toBe(true);
    expect(skipped.has("calendar_sync")).toBe(false);
  });

  it("skipping the same item twice is idempotent", () => {
    markSetupItemSkipped("user-a", "install");
    markSetupItemSkipped("user-a", "install");
    expect(Array.from(readSkippedSetupItems("user-a"))).toEqual(["install"]);
  });

  it("all three items can be skipped independently", () => {
    markSetupItemSkipped("user-a", "install");
    markSetupItemSkipped("user-a", "notifications");
    markSetupItemSkipped("user-a", "calendar_sync");
    const skipped = readSkippedSetupItems("user-a");
    expect(skipped.size).toBe(3);
  });
});

describe("setupCardPreference — fails safe on corrupt/unavailable storage", () => {
  it("a corrupt/garbage stored value reads back as empty, never crashes", () => {
    window.localStorage.setItem("mi-ma-mo:setup-card-skipped:user-a", "not-json");
    expect(readSkippedSetupItems("user-a").size).toBe(0);
  });

  it("a stored value that isn't an array reads back as empty", () => {
    window.localStorage.setItem("mi-ma-mo:setup-card-skipped:user-a", JSON.stringify({ install: true }));
    expect(readSkippedSetupItems("user-a").size).toBe(0);
  });

  it("unknown item keys in a stored array are dropped, never crash", () => {
    window.localStorage.setItem("mi-ma-mo:setup-card-skipped:user-a", JSON.stringify(["install", "bogus_item"]));
    const skipped = readSkippedSetupItems("user-a");
    expect(skipped.has("install")).toBe(true);
    expect(skipped.size).toBe(1);
  });

  it("localStorage.getItem throwing reads back as empty, never throws", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => readSkippedSetupItems("user-a")).not.toThrow();
    expect(readSkippedSetupItems("user-a").size).toBe(0);
  });

  it("localStorage.setItem throwing never throws out of markSetupItemSkipped", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => markSetupItemSkipped("user-a", "install")).not.toThrow();
  });
});
