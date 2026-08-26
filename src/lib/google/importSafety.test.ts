import { describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_SPREADSHEET_ID",
  "GOOGLE_EMERGENCY_SPREADSHEET_ID",
] as const;

describe("module import safety", () => {
  it("importing the Google Sheets modules never throws, even with no env vars set", async () => {
    for (const key of ENV_KEYS) delete process.env[key];

    vi.resetModules();

    await expect(import("./client")).resolves.toBeDefined();
    await expect(import("./fetchWorkbookSnapshot")).resolves.toBeDefined();
    await expect(import("./index")).resolves.toBeDefined();
  });

  /**
   * A missing `GOOGLE_EMERGENCY_SPREADSHEET_ID` (or the regular Google
   * vars) must NEVER break `next build`/regular-mode module loading --
   * validation only happens lazily, inside an actual emergency fetch
   * call (spec section 4/29: "missing/broken emergency workbook
   * configuration must NOT break the normal app").
   */
  it("importing the emergency Google Sheets modules never throws, even with no env vars set", async () => {
    for (const key of ENV_KEYS) delete process.env[key];

    vi.resetModules();

    await expect(import("./emergencyConfig")).resolves.toBeDefined();
    await expect(import("./emergencyClient")).resolves.toBeDefined();
    await expect(import("./fetchEmergencyWorkbookSnapshot")).resolves.toBeDefined();
    await expect(import("./index")).resolves.toBeDefined();
  });
});
