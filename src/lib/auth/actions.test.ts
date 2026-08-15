import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
const createSupabaseServerClient = vi.fn(async () => ({ auth: { signOut } }));
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const deletePushSubscriptionForCurrentUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/notifications/subscriptionStore", () => ({
  deletePushSubscriptionForCurrentUser: (...args: unknown[]) => deletePushSubscriptionForCurrentUser(...args),
}));

const { signOutAction } = await import("./actions");

beforeEach(() => {
  signOut.mockReset();
  redirect.mockReset().mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
  deletePushSubscriptionForCurrentUser.mockReset().mockResolvedValue({ ok: true });
});

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

  it("works exactly as before when called with no arguments at all (no push endpoint to clean up)", async () => {
    signOut.mockResolvedValue({ error: null });
    await expect(signOutAction()).rejects.toThrow("REDIRECT:/login");
    expect(deletePushSubscriptionForCurrentUser).not.toHaveBeenCalled();
  });
});

describe("signOutAction — push subscription cleanup (PR #29)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("best-effort deletes the device's push subscription row BEFORE signing out (while the session is still valid)", async () => {
    signOut.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set("pushEndpoint", "https://push.example/e1");

    await expect(signOutAction(formData)).rejects.toThrow("REDIRECT:/login");

    expect(deletePushSubscriptionForCurrentUser).toHaveBeenCalledWith("https://push.example/e1");
    expect(deletePushSubscriptionForCurrentUser.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });

  it("skips cleanup silently when no pushEndpoint field is present", async () => {
    signOut.mockResolvedValue({ error: null });
    const formData = new FormData();

    await expect(signOutAction(formData)).rejects.toThrow("REDIRECT:/login");
    expect(deletePushSubscriptionForCurrentUser).not.toHaveBeenCalled();
  });

  it("skips cleanup silently when the pushEndpoint field is an empty string", async () => {
    signOut.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set("pushEndpoint", "");

    await expect(signOutAction(formData)).rejects.toThrow("REDIRECT:/login");
    expect(deletePushSubscriptionForCurrentUser).not.toHaveBeenCalled();
  });

  it("a failing cleanup (rejected promise) never blocks sign-out", async () => {
    signOut.mockResolvedValue({ error: null });
    deletePushSubscriptionForCurrentUser.mockRejectedValue(new Error("db unavailable"));
    const formData = new FormData();
    formData.set("pushEndpoint", "https://push.example/e1");

    await expect(signOutAction(formData)).rejects.toThrow("REDIRECT:/login");
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("a hanging cleanup call is bounded by a timeout and never blocks sign-out", async () => {
    signOut.mockResolvedValue({ error: null });
    deletePushSubscriptionForCurrentUser.mockReturnValue(new Promise(() => {})); // never resolves
    const formData = new FormData();
    formData.set("pushEndpoint", "https://push.example/e1");

    vi.useFakeTimers();
    const actionPromise = expect(signOutAction(formData)).rejects.toThrow("REDIRECT:/login");
    await vi.runAllTimersAsync();
    await actionPromise;

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
