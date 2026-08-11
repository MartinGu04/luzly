import { describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_SPREADSHEET_ID",
] as const;

describe("module import safety", () => {
  it("importing the Google Sheets modules never throws, even with no env vars set", async () => {
    for (const key of ENV_KEYS) delete process.env[key];

    vi.resetModules();

    await expect(import("./client")).resolves.toBeDefined();
    await expect(import("./fetchWorkbookSnapshot")).resolves.toBeDefined();
    await expect(import("./index")).resolves.toBeDefined();
  });
});
