import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const getAuthenticatedIdentity = vi.fn();

vi.mock("./currentUser", () => ({ getAuthenticatedIdentity }));

const { getRequestAuthenticatedIdentity } = await import("./getRequestAuthenticatedIdentity");

/**
 * Same caveat as `getRequestPersonalSchedule.test.ts`: true cross-call
 * dedup comes from React's `cache()` dispatcher, only present inside a
 * real Server Component render. This suite verifies correct delegation.
 */
describe("getRequestAuthenticatedIdentity", () => {
  it("delegates to getAuthenticatedIdentity and returns its result", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });

    const result = await getRequestAuthenticatedIdentity();

    expect(result).toEqual({ status: "unauthenticated" });
    expect(getAuthenticatedIdentity).toHaveBeenCalledTimes(1);
  });

  it("takes no arguments -- identity always comes from the request's own cookies, never a caller-supplied value", () => {
    expect(getRequestAuthenticatedIdentity.length).toBe(0);
  });
});

describe("getRequestAuthenticatedIdentity -- never a persistent/cross-request cache", () => {
  it("is built ONLY from React's request-scoped cache() -- never unstable_cache, never a module-level mutable variable holding identity", () => {
    const source = fs.readFileSync(path.join(__dirname, "getRequestAuthenticatedIdentity.ts"), "utf8");
    expect(source).toContain('import { cache } from "react"');
    expect(source).toContain("cache(getAuthenticatedIdentity)");
    expect(source).not.toContain('from "next/cache"');
    expect(source).not.toMatch(/^\s*(export\s+)?let\s/m);
  });
});
