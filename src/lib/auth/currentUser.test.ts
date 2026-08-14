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
      avatarUrl: null,
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
      avatarUrl: null,
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

describe("getAuthenticatedIdentity — avatarUrl (presentation-only, no extra Google call)", () => {
  it("picks up a valid https avatar_url from user_metadata", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "dani@example.invalid",
          user_metadata: { avatar_url: "https://lh3.googleusercontent.com/a/photo.jpg" },
        },
      },
      error: null,
    });
    const result = await getAuthenticatedIdentity();
    expect(result).toMatchObject({ avatarUrl: "https://lh3.googleusercontent.com/a/photo.jpg" });
  });

  it("falls back to the raw Google OIDC 'picture' claim when avatar_url is absent", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "dani@example.invalid",
          user_metadata: { picture: "https://lh3.googleusercontent.com/a/other.jpg" },
        },
      },
      error: null,
    });
    const result = await getAuthenticatedIdentity();
    expect(result).toMatchObject({ avatarUrl: "https://lh3.googleusercontent.com/a/other.jpg" });
  });

  it("prefers avatar_url over picture when both are present", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "dani@example.invalid",
          user_metadata: {
            avatar_url: "https://lh3.googleusercontent.com/a/preferred.jpg",
            picture: "https://lh3.googleusercontent.com/a/other.jpg",
          },
        },
      },
      error: null,
    });
    const result = await getAuthenticatedIdentity();
    expect(result).toMatchObject({ avatarUrl: "https://lh3.googleusercontent.com/a/preferred.jpg" });
  });

  it("is null when user_metadata has no avatar field at all", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "dani@example.invalid", user_metadata: { full_name: "דני בדיקה" } } },
      error: null,
    });
    const result = await getAuthenticatedIdentity();
    expect(result).toMatchObject({ avatarUrl: null });
  });

  it("is null when user_metadata is entirely absent", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "dani@example.invalid" } }, error: null });
    const result = await getAuthenticatedIdentity();
    expect(result).toMatchObject({ avatarUrl: null });
  });

  it("rejects a non-string avatar_url rather than trusting it as-is", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "dani@example.invalid", user_metadata: { avatar_url: 12345 } } },
      error: null,
    });
    const result = await getAuthenticatedIdentity();
    expect(result).toMatchObject({ avatarUrl: null });
  });

  it("rejects a non-https URL (e.g. javascript:/data: schemes, or plain http)", async () => {
    for (const malicious of ["javascript:alert(1)", "data:text/html,evil", "http://example.invalid/a.jpg", "not a url"]) {
      getUser.mockResolvedValue({
        data: { user: { id: "u1", email: "dani@example.invalid", user_metadata: { avatar_url: malicious } } },
        error: null,
      });
      const result = await getAuthenticatedIdentity();
      expect(result).toMatchObject({ avatarUrl: null });
    }
  });

  it("never exposes the raw user_metadata object itself in the returned identity", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "u1",
          email: "dani@example.invalid",
          user_metadata: { avatar_url: "https://lh3.googleusercontent.com/a/photo.jpg", full_name: "דני בדיקה" },
        },
      },
      error: null,
    });
    const result = await getAuthenticatedIdentity();
    expect(result).not.toHaveProperty("user_metadata");
    expect(result).not.toHaveProperty("full_name");
    expect(Object.keys(result).sort()).toEqual(["avatarUrl", "email", "status", "userId"]);
  });

  it("missing_email never carries an avatarUrl field either -- it's only meaningful once truly authenticated", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: undefined, user_metadata: { avatar_url: "https://example.invalid/a.jpg" } } },
      error: null,
    });
    const result = await getAuthenticatedIdentity();
    expect(result).not.toHaveProperty("avatarUrl");
  });
});
