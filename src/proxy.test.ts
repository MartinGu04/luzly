import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

let capturedCookiesAdapter: {
  getAll: () => unknown;
  setAll: (cookiesToSet: CookieToSet[]) => void;
} | null = null;

const getUser = vi.fn();
const createServerClient = vi.fn(
  (_url: string, _key: string, options: { cookies: typeof capturedCookiesAdapter }) => {
    capturedCookiesAdapter = options.cookies;
    return { auth: { getUser } };
  },
);

vi.mock("@supabase/ssr", () => ({ createServerClient }));

const { proxy } = await import("./proxy");

beforeEach(() => {
  createServerClient.mockClear();
  getUser.mockReset();
  capturedCookiesAdapter = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key-placeholder";
});

describe("proxy", () => {
  it("1. refreshes the session and propagates any refreshed cookies onto the response", async () => {
    getUser.mockImplementation(async () => {
      // Simulate @supabase/ssr internally refreshing the session and
      // writing the renewed cookie via the adapter passed to it.
      capturedCookiesAdapter?.setAll([
        { name: "sb-access-token", value: "refreshed-token", options: { path: "/" } },
      ]);
      return { data: { user: { id: "u1" } }, error: null };
    });

    const request = new NextRequest("https://luzly.example/");
    const response = await proxy(request);

    expect(response.cookies.get("sb-access-token")?.value).toBe("refreshed-token");
  });

  it("still returns a normal pass-through response when there is nothing to refresh", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const request = new NextRequest("https://luzly.example/");
    const response = await proxy(request);

    expect(response.status).toBe(200);
  });

  it("2. does not use a shared/global client -- a fresh client is created on every call", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await proxy(new NextRequest("https://luzly.example/"));
    await proxy(new NextRequest("https://luzly.example/other"));

    expect(createServerClient).toHaveBeenCalledTimes(2);
  });

  it("uses only the public publishable key, never a service-role/secret key", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await proxy(new NextRequest("https://luzly.example/"));

    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-publishable-key-placeholder",
      expect.anything(),
    );
  });

  it("calls getUser() to validate/refresh the session (not just reading a cached session)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await proxy(new NextRequest("https://luzly.example/"));

    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("12. throws a clear config error when invoked without Supabase env configured (never silently proceeds)", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    await expect(proxy(new NextRequest("https://luzly.example/"))).rejects.toThrow();
  });

  it("exports a matcher config that excludes static/internal Next assets", async () => {
    const { config } = await import("./proxy");
    expect(config.matcher).toBeDefined();
    const matcherSource = JSON.stringify(config.matcher);
    expect(matcherSource).toContain("_next/static");
    expect(matcherSource).toContain("_next/image");
  });
});
