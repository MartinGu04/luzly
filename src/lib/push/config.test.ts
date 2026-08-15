import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ENV_KEYS = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("module import safety", () => {
  it("importing lib/push/config never throws, even with no env vars set (build without VAPID configured)", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    await expect(import("./config")).resolves.toBeDefined();
  });
});

describe("readVapidServerConfig", () => {
  it("throws a typed VapidConfigError only when actually called, listing every missing var", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const { readVapidServerConfig, VapidConfigError } = await import("./config");

    expect(() => readVapidServerConfig()).toThrow(VapidConfigError);
    expect(() => readVapidServerConfig()).toThrow(/NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
    expect(() => readVapidServerConfig()).toThrow(/VAPID_PRIVATE_KEY/);
    expect(() => readVapidServerConfig()).toThrow(/VAPID_SUBJECT/);
  });

  it("throws only for the specific missing var when partially configured", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_SUBJECT = "mailto:test@example.invalid";
    delete process.env.VAPID_PRIVATE_KEY;

    const { readVapidServerConfig } = await import("./config");
    expect(() => readVapidServerConfig()).toThrow(/VAPID_PRIVATE_KEY/);
    try {
      readVapidServerConfig();
    } catch (error) {
      expect(String(error)).not.toMatch(/NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
      expect(String(error)).not.toMatch(/VAPID_SUBJECT/);
    }
  });

  it("returns the full config once all three are set", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    process.env.VAPID_SUBJECT = "mailto:test@example.invalid";

    const { readVapidServerConfig } = await import("./config");
    expect(readVapidServerConfig()).toEqual({
      publicKey: "test-public-key",
      privateKey: "test-private-key",
      subject: "mailto:test@example.invalid",
    });
  });
});

/**
 * VAPID_PRIVATE_KEY must never reach a client bundle -- every source file
 * that even MENTIONS the identifier must be marked `server-only` (a
 * client import of such a file fails the build outright). Scans the
 * whole `src/` tree, not just `lib/push`, so a future file elsewhere
 * that imports/re-reads this env var directly would also be caught.
 */
describe("VAPID_PRIVATE_KEY -- server-only everywhere it's referenced", () => {
  function findSourceFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let results: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(findSourceFiles(fullPath));
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it("every file mentioning VAPID_PRIVATE_KEY is guarded by 'server-only'", () => {
    const srcRoot = path.resolve(__dirname, "..", "..");
    const files = findSourceFiles(srcRoot);
    const referencingFiles = files.filter((file) => fs.readFileSync(file, "utf8").includes("VAPID_PRIVATE_KEY"));

    expect(referencingFiles.length).toBeGreaterThan(0); // sanity check the scan itself works
    for (const file of referencingFiles) {
      const content = fs.readFileSync(file, "utf8");
      expect(content, `${file} references VAPID_PRIVATE_KEY but is not server-only`).toMatch(/import\s+"server-only"/);
    }
  });
});
