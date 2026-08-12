import { describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
const createSupabaseServerClient = vi.fn(async () => ({ auth: { signOut } }));
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/navigation", () => ({ redirect }));

const { signOutAction } = await import("./actions");

describe("signOutAction", () => {
  it("11. signs out server-side and redirects to /login", async () => {
    signOut.mockResolvedValue({ error: null });

    await expect(signOutAction()).rejects.toThrow("REDIRECT:/login");

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login even if a later step fails to leave no protected UI reachable", async () => {
    signOut.mockResolvedValue({ error: { message: "network hiccup" } });

    await expect(signOutAction()).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
