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

/**
 * Structural proof that every loader capable of co-rendering within the
 * SAME request shares this ONE identity primitive, rather than each
 * independently calling the raw `getAuthenticatedIdentity()` (which would
 * mean a separate live `getUser()` round trip per loader on the same
 * render, exactly the bug this file exists to close):
 *
 * - `(app)/layout.tsx` renders `getRequestPersonalSchedule()` (→
 *   `personalSchedule.ts`) and `getRequestSearchReadModel()` (→
 *   `search.ts`) together, via `Promise.all`, on EVERY route under it.
 * - The dashboard page additionally renders `recentDashboardChanges.ts`'s
 *   loader on the SAME request.
 * - `/manager` additionally renders `managerWorkbookContext.ts`'s
 *   authorization gate on the SAME request.
 *
 * A grep-based check (not a full render) because true cross-call dedup
 * only exists inside Next's real per-request `cache()` dispatcher -- see
 * this file's own top describe block, and `requestScopedLoader.test.ts`
 * for the identical convention applied to `getRequestPersonalSchedule`.
 */
describe("getRequestAuthenticatedIdentity -- shared by every loader that can co-render in one request", () => {
  const readModelsDir = path.resolve(__dirname, "../readModels");
  const COVERED_LOADERS = [
    "personalSchedule.ts",
    "search.ts",
    "recentDashboardChanges.ts",
    "managerWorkbookContext.ts",
  ];

  it.each(COVERED_LOADERS)("%s imports getRequestAuthenticatedIdentity, never the raw getAuthenticatedIdentity directly", (file) => {
    const source = fs.readFileSync(path.join(readModelsDir, file), "utf8");
    expect(source).toContain("getRequestAuthenticatedIdentity");
    expect(source).not.toMatch(/from ["']@\/lib\/auth\/currentUser["']/);
  });
});
