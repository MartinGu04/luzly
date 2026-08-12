import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn();
const createSupabaseServerClient = vi.fn(async () => ({
  auth: { exchangeCodeForSession },
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { GET } = await import("./route");

beforeEach(() => {
  exchangeCodeForSession.mockReset();
});

describe("GET /auth/callback", () => {
  it("12. success redirects into the app at the sanitized next path", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    const request = new NextRequest("https://luzly.example/auth/callback?code=abc123&next=%2Fschedule");

    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toBe("https://luzly.example/schedule");
  });

  it('defaults to "/" when no next param is given', async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    const request = new NextRequest("https://luzly.example/auth/callback?code=abc123");

    const response = await GET(request);

    expect(response.headers.get("location")).toBe("https://luzly.example/");
  });

  it("13. an exchange failure redirects to a safe login error state, exposing no provider details", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      error: { message: "invalid_grant: some sensitive provider detail" },
    });
    const request = new NextRequest("https://luzly.example/auth/callback?code=bad-code");

    const response = await GET(request);

    const location = response.headers.get("location");
    expect(location).toBe("https://luzly.example/login?error=auth");
    expect(location).not.toContain("invalid_grant");
    expect(location).not.toContain("sensitive");
  });

  it("a missing code redirects to the same safe login error state, never calling Supabase", async () => {
    const request = new NextRequest("https://luzly.example/auth/callback");

    const response = await GET(request);

    expect(response.headers.get("location")).toBe("https://luzly.example/login?error=auth");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("14. an unsafe external redirect target is rejected, falling back to \"/\"", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    const request = new NextRequest(
      "https://luzly.example/auth/callback?code=abc123&next=https%3A%2F%2Fevil.example",
    );

    const response = await GET(request);

    expect(response.headers.get("location")).toBe("https://luzly.example/");
  });

  it("14b. a protocol-relative //host redirect target is rejected", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    const request = new NextRequest(
      "https://luzly.example/auth/callback?code=abc123&next=%2F%2Fevil.example",
    );

    const response = await GET(request);

    expect(response.headers.get("location")).toBe("https://luzly.example/");
  });
});
