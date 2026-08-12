import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const createSupabaseServerClient = vi.fn(async () => ({ auth: { getUser } }));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { getAuthenticatedIdentity } = await import("./currentUser");

beforeEach(() => {
  getUser.mockReset();
  createSupabaseServerClient.mockClear();
});

describe("getAuthenticatedIdentity", () => {
  it("8. returns { status: 'unauthenticated' } when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getAuthenticatedIdentity()).toEqual({ status: "unauthenticated" });
  });

  it("returns unauthenticated on a Supabase auth error, never throwing", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "boom" } });
    await expect(getAuthenticatedIdentity()).resolves.toEqual({ status: "unauthenticated" });
  });

  it("5. an authenticated user with no usable email is 'missing_email', distinct from 'unauthenticated'", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: undefined } }, error: null });
    const result = await getAuthenticatedIdentity();
    expect(result).toEqual({ status: "missing_email", userId: "u1" });
    expect(result.status).not.toBe("unauthenticated");
  });

  it("blank/whitespace-only email is also 'missing_email', never falling back to name/metadata matching", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "   ", user_metadata: { full_name: "דני בדיקה" } } },
      error: null,
    });
    expect(await getAuthenticatedIdentity()).toEqual({ status: "missing_email", userId: "u1" });
  });

  it("resolves userId/email from the server-verified user record when authenticated with an email", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "dani@example.invalid" } }, error: null });
    expect(await getAuthenticatedIdentity()).toEqual({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
    });
  });

  it("trims the email from the provider record", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "  dani@example.invalid  " } },
      error: null,
    });
    expect(await getAuthenticatedIdentity()).toEqual({
      status: "authenticated",
      userId: "u1",
      email: "dani@example.invalid",
    });
  });

  it("uses Supabase's server-verified getUser(), not a locally-trusted getSession()", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "dani@example.invalid" } }, error: null });
    await getAuthenticatedIdentity();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("takes no arguments -- there is no code path for a caller to supply an email", () => {
    expect(getAuthenticatedIdentity.length).toBe(0);
  });

  it("creates a fresh server client per call rather than reusing a shared instance", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "dani@example.invalid" } }, error: null });
    await getAuthenticatedIdentity();
    await getAuthenticatedIdentity();
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(2);
  });
});
