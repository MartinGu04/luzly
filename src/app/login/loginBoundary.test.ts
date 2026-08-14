import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Static regression guard for the login route's privacy boundary (Design
 * Pass PR #22 §27): /login is unauthenticated, so nothing it renders may
 * fetch/import a Google Sheets workbook loader, a personal/manager read
 * model, or raw parsed sheet data -- checked by source, not by mocking,
 * so a future edit that quietly wires one in fails this test even if no
 * render-level test happens to exercise that path.
 */
const FORBIDDEN_PATTERNS = [
  /getRequestPersonalSchedule/,
  /getRequestManagerOverview/,
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

const LOGIN_SOURCE_FILES = [
  path.resolve(__dirname, "page.tsx"),
  ...fs
    .readdirSync(path.resolve(__dirname, "..", "..", "components", "login"))
    .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
    .map((name) => path.resolve(__dirname, "..", "..", "components", "login", name)),
  path.resolve(__dirname, "..", "..", "components", "auth", "GoogleSignInButton.tsx"),
];

describe("login route data-exposure guard", () => {
  it("finds the login page and its component files (sanity check the scan itself works)", () => {
    for (const file of LOGIN_SOURCE_FILES) {
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it("no login-route source file imports/calls an authenticated data loader or raw sheet parser", () => {
    for (const file of LOGIN_SOURCE_FILES) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
