import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("module import safety", () => {
  it("15. importing supabase config/client/server never throws, even with no env vars set", async () => {
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
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const { readSupabasePublicConfig, SupabaseConfigError } = await import("./config");

    expect(() => readSupabasePublicConfig()).toThrow(SupabaseConfigError);
    expect(() => readSupabasePublicConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => readSupabasePublicConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("returns the config when both vars are present", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key-placeholder";

    const { readSupabasePublicConfig } = await import("./config");

    expect(readSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      anonKey: "test-anon-key-placeholder",
    });
  });
});
