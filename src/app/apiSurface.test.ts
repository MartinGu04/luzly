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

/**
 * PR #28 introduced Service Worker registration; PR #29 (real Web Push
 * subscriptions) deliberately introduces the two browser calls that
 * actually opt a device in -- `Notification.requestPermission()` and
 * `pushManager.subscribe(...)` -- so the OLD, broader version of this
 * guard (banning both outright) is now obsolete on exactly the code this
 * PR was asked to add. The invariant that still matters, restated: these
 * two calls are confined to the ONE file that only ever runs them from
 * an explicit user click (`components/pwa/usePushSubscription.ts` --
 * see its own docstring), never scattered, never automatic on
 * load/login/install/navigation. A raw `new Notification(...)` stays
 * forbidden everywhere -- every real notification must be displayed by
 * the Service Worker (`public/sw.js`'s `showNotification`), never
 * constructed directly on the page.
 */
describe("39. notification permission/subscription calls are confined to one explicit-consent file", () => {
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

  const sourceRoot = path.resolve(__dirname, "..");
  const files = findComponentFiles(sourceRoot);
  const ALLOWED_CONSENT_FILE = path.join(sourceRoot, "components", "pwa", "usePushSubscription.ts");

  it("finds source files (sanity check the scan itself works)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no source file ever constructs a raw browser Notification directly -- display always goes through the Service Worker", () => {
    for (const file of files) {
      expect(fs.readFileSync(file, "utf8")).not.toMatch(/new Notification\(/);
    }
  });

  it("Notification.requestPermission() is confined to the one explicit-consent hook, never elsewhere", () => {
    const callers = files.filter((file) => /Notification\.requestPermission/.test(fs.readFileSync(file, "utf8")));
    expect(callers).toEqual([ALLOWED_CONSENT_FILE]);
  });

  it("pushManager.subscribe(...) is confined to the same one file", () => {
    const callers = files.filter((file) => /pushManager\.subscribe/.test(fs.readFileSync(file, "utf8")));
    expect(callers).toEqual([ALLOWED_CONSENT_FILE]);
  });

  it("Service Worker registration, where it exists, is confined to the one dedicated PWA component", () => {
    const registrationCallers = files.filter((file) => /navigator\.serviceWorker\.register\(/.test(fs.readFileSync(file, "utf8")));
    expect(registrationCallers).toEqual([path.join(sourceRoot, "components", "pwa", "ServiceWorkerManager.tsx")]);
  });
});
