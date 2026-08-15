import { afterEach, describe, expect, it } from "vitest";

const ORIGINAL = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = ORIGINAL;
});

describe("getVapidPublicKey", () => {
  it("throws a typed VapidPublicConfigError when missing, never crashes the module", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const { getVapidPublicKey, VapidPublicConfigError } = await import("./publicConfig");
    expect(() => getVapidPublicKey()).toThrow(VapidPublicConfigError);
  });

  it("returns the configured public key", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
    const { getVapidPublicKey } = await import("./publicConfig");
    expect(getVapidPublicKey()).toBe("test-public-key");
  });

  it("never reads/exposes VAPID_PRIVATE_KEY", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const content = fs.readFileSync(path.join(__dirname, "publicConfig.ts"), "utf8");
    expect(content).not.toMatch(/VAPID_PRIVATE_KEY/);
  });
});
