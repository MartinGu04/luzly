import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * True request-scoped deduplication of the personal schedule load (one
 * Google workbook batch fetch per normal request, shared by the protected
 * layout's identity check and the dashboard page's content) comes from
 * React's `cache()` at Next.js's real runtime -- it can't be exercised in
 * a plain Vitest process (see `getRequestPersonalSchedule.test.ts`).
 *
 * What CAN be verified here, structurally: neither the layout nor the page
 * bypasses the shared `getRequestPersonalSchedule` wrapper by calling the
 * underlying loader (or the older `resolveCurrentPerson`) directly. If
 * either did, a normal request would perform two separate Google reads
 * regardless of how `getRequestPersonalSchedule` itself is implemented.
 */
describe("3. layout/page reuse the same request-scoped loader, never a second direct call", () => {
  const appDir = path.resolve(__dirname, "(app)");
  const layoutSource = fs.readFileSync(path.join(appDir, "layout.tsx"), "utf8");
  const pageSource = fs.readFileSync(path.join(appDir, "(dashboard)", "page.tsx"), "utf8");
  const scheduleSource = fs.readFileSync(path.join(appDir, "schedule", "page.tsx"), "utf8");
  const dutiesSource = fs.readFileSync(path.join(appDir, "duties", "page.tsx"), "utf8");

  const FORBIDDEN_DIRECT_CALLS = [/resolveCurrentPerson/, /\bloadPersonalScheduleReadModel\b/];

  it("the protected layout only imports getRequestPersonalSchedule, not the raw loader", () => {
    expect(layoutSource).toContain("getRequestPersonalSchedule");
    for (const pattern of FORBIDDEN_DIRECT_CALLS) {
      expect(layoutSource).not.toMatch(pattern);
    }
  });

  it("the dashboard page only imports getRequestPersonalSchedule, not the raw loader", () => {
    expect(pageSource).toContain("getRequestPersonalSchedule");
    for (const pattern of FORBIDDEN_DIRECT_CALLS) {
      expect(pageSource).not.toMatch(pattern);
    }
  });

  it("the schedule page only imports getRequestSchedule, not the raw loader -- getRequestSchedule itself reuses the SAME request-scoped getRequestPersonalSchedule() internally (PR #24), same no-second-Google-request guarantee as every other route here", () => {
    expect(scheduleSource).toContain("getRequestSchedule");
    expect(scheduleSource).not.toContain("getRequestPersonalSchedule");
    for (const pattern of [...FORBIDDEN_DIRECT_CALLS, /\bloadScheduleReadModel\b/]) {
      expect(scheduleSource).not.toMatch(pattern);
    }
  });

  it("the duties page only imports getRequestPersonalSchedule, not the raw loader -- same request-scoped load as the layout, no second Google request", () => {
    expect(dutiesSource).toContain("getRequestPersonalSchedule");
    for (const pattern of FORBIDDEN_DIRECT_CALLS) {
      expect(dutiesSource).not.toMatch(pattern);
    }
  });

});
