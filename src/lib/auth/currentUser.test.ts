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
  it("returns null when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getAuthenticatedIdentity()).toBeNull();
  });

  it("returns null on a Supabase auth error, never throwing", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "boom" } });
    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
  });

  it("6. denies a user whose account has no usable email", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: undefined } }, error: null });
    expect(await getAuthenticatedIdentity()).toBeNull();
  });

  it("denies a user whose email is blank/whitespace-only, never falling back to name matching", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "   ", user_metadata: { full_name: "דני בדיקה" } } },
      error: null,
    });
    expect(await getAuthenticatedIdentity()).toBeNull();
  });

  it("resolves userId/email from the server-verified user record", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "dani@example.invalid" } }, error: null });
    expect(await getAuthenticatedIdentity()).toEqual({ userId: "u1", email: "dani@example.invalid" });
  });

  it("4. trims the email from the provider record", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "  dani@example.invalid  " } },
      error: null,
    });
    expect(await getAuthenticatedIdentity()).toEqual({ userId: "u1", email: "dani@example.invalid" });
  });

  it("10. uses Supabase's server-verified getUser(), not a locally-trusted getSession()", async () => {
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
