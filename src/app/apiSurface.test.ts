import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression guard for the core security boundary of this PR: no route
 * handler under src/app may return the raw workbook snapshot or the full
 * parsed personnel/schedule data to the browser. Scans every route.ts for
 * anything that would pull that data in, rather than just trusting no one
 * writes one later.
 */
function findRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findRouteFiles(fullPath));
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      results.push(fullPath);
    }
  }

  return results;
}

const FORBIDDEN_PATTERNS = [
  /fetchRawWorkbookSnapshot/,
  /RawWorkbookSnapshot/,
  /parsePersonnelSheet/,
  /parseScheduleSheet/,
  /parseSettingsSheet/,
];

describe("route handler data-exposure guard", () => {
  const appDir = path.resolve(__dirname);
  const routeFiles = findRouteFiles(appDir);

  it("19. finds at least one route handler (sanity check the scan itself works)", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it("19. no route handler imports/returns the raw workbook snapshot or full parsed sheets", () => {
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
