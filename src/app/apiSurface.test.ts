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
  /parsePotentialSheet/,
  /loadPersonalScheduleReadModel/,
  /buildPersonalScheduleReadModel/,
  /loadManagerOverviewReadModel/,
  /buildManagerOverviewReadModel/,
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

describe("37. no public schedule/personnel API route exists yet", () => {
  it("there is no src/app/api directory", () => {
    const apiDir = path.resolve(__dirname, "api");
    expect(fs.existsSync(apiDir)).toBe(false);
  });
});

describe("manager client-boundary guard (PR #14 §36)", () => {
  function findComponentFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let results: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(findComponentFiles(fullPath));
      } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const componentsRoot = path.resolve(__dirname, "..", "components");
  const clientComponentFiles = findComponentFiles(componentsRoot).filter((file) =>
    fs.readFileSync(file, "utf8").startsWith('"use client"'),
  );

  it("finds at least one client component (sanity check the scan itself works)", () => {
    expect(clientComponentFiles.length).toBeGreaterThan(0);
  });

  it("no client component ('use client') ever imports the full ManagerOverviewReadModel/raw manager data types", () => {
    const FORBIDDEN_CLIENT_PATTERNS = [
      /ManagerOverviewReadModel/,
      /RawWorkbookSnapshot/,
      /RawSheet/,
      /PotentialAllocation/,
      /fetchRawWorkbookSnapshot/,
    ];
    for (const file of clientComponentFiles) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_CLIENT_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});

describe("39. no browser notification logic exists yet", () => {
  function findComponentFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let results: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(findComponentFiles(fullPath));
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const NOTIFICATION_PATTERNS = [
    /Notification\.requestPermission/,
    /new Notification\(/,
    /navigator\.serviceWorker/,
    /registerServiceWorker/,
  ];

  const sourceRoot = path.resolve(__dirname, "..");
  const files = findComponentFiles(sourceRoot);

  it("finds source files (sanity check the scan itself works)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no source file calls the browser Notification/ServiceWorker APIs", () => {
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of NOTIFICATION_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
