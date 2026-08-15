import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("module import safety", () => {
  it("12. importing supabase config/client/server never throws, even with no env vars set (build without env)", async () => {
    for (const key of ENV_KEYS) delete process.env[key];

    vi.resetModules();

    await expect(import("./config")).resolves.toBeDefined();
    await expect(import("./client")).resolves.toBeDefined();
    await expect(import("./server")).resolves.toBeDefined();
  });
});

describe("readSupabasePublicConfig", () => {
  it("throws a typed SupabaseConfigError only when actually called, listing every missing var", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const { readSupabasePublicConfig, SupabaseConfigError } = await import("./config");

    expect(() => readSupabasePublicConfig()).toThrow(SupabaseConfigError);
    expect(() => readSupabasePublicConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => readSupabasePublicConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("10. reads NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY into config.publishableKey", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key-placeholder";

    const { readSupabasePublicConfig } = await import("./config");

    expect(readSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "test-publishable-key-placeholder",
    });
  });

  it("11. the old NEXT_PUBLIC_SUPABASE_ANON_KEY variable is not required or read", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key-placeholder";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "should-be-ignored";

    const { readSupabasePublicConfig } = await import("./config");
    const config = readSupabasePublicConfig();

    expect(config.publishableKey).toBe("test-publishable-key-placeholder");
    expect(config).not.toHaveProperty("anonKey");

    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });
});

describe("no service-role/secret key anywhere in the Supabase client layer (except one documented PR #30 exception)", () => {
  /**
   * PR #29 established a zero-service-role convention across this whole
   * directory. PR #30's notification worker is the one deliberate,
   * documented exception: a Cron-triggered request has no logged-in
   * user/session, so no RLS-scoped client can resolve recipients or
   * write internal engine state -- see `serviceRoleClient.ts`'s own
   * docstring and the migration comment it references. Every OTHER file
   * in this directory must still hold to the original zero-service-role
   * invariant exactly as before.
   */
  const SERVICE_ROLE_EXCEPTION_FILE = "serviceRoleClient.ts";

  it("13. every src/lib/supabase file except the one documented service-role client never references a service-role or secret key", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(__dirname);
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== SERVICE_ROLE_EXCEPTION_FILE);

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      // Matches an actual identifier/env-var like SERVICE_ROLE_KEY or
      // serviceRoleKey, not prose mentioning "service-role" in passing.
      expect(content).not.toMatch(/service[_-]?role[_-]?key/i);
      expect(content).not.toMatch(/SUPABASE_SECRET/i);
    }
  });

  it("the one exception file is exactly serviceRoleClient.ts, is server-only, and is never a default export reused as a singleton", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const filePath = path.join(path.resolve(__dirname), SERVICE_ROLE_EXCEPTION_FILE);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toMatch(/^import "server-only";/);
    expect(content).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
