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
 * PR #28 (PWA foundation) deliberately introduces a real, carefully-scoped
 * `navigator.serviceWorker.register(...)` call
 * (`components/pwa/ServiceWorkerManager.tsx`) -- so the OLD, broader
 * version of this guard (banning `navigator.serviceWorker` outright) is
 * now obsolete and would fail on exactly the code this PR was asked to
 * add. The invariant that actually matters going forward, restated: no
 * source file may show a real BROWSER PERMISSION PROMPT or create a real
 * PUSH SUBSCRIPTION yet -- that is explicit user opt-in UI reserved for a
 * future Push Notifications PR (see `lib/pwa/README.md`). Service Worker
 * *registration* (lifecycle only, no offline caching, no push
 * subscription) is the one browser-notification-adjacent API this PR is
 * intentionally allowed to use.
 */
describe("39. no notification permission prompt or push subscription exists yet", () => {
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
    /pushManager\.subscribe/,
    /\.subscribe\(\s*\{\s*userVisibleOnly/,
  ];

  const sourceRoot = path.resolve(__dirname, "..");
  const files = findComponentFiles(sourceRoot);

  it("finds source files (sanity check the scan itself works)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no source file requests notification permission or creates a push subscription", () => {
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of NOTIFICATION_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  it("Service Worker registration, where it exists, is confined to the one dedicated PWA component", () => {
    const registrationCallers = files.filter((file) => /navigator\.serviceWorker\.register\(/.test(fs.readFileSync(file, "utf8")));
    expect(registrationCallers).toEqual([path.join(sourceRoot, "components", "pwa", "ServiceWorkerManager.tsx")]);
  });
});
