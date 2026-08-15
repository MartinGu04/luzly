import { describe, expect, it, vi } from "vitest";
import type { RawPushSubscription } from "@/lib/push/subscriptionValidation";

const rpcMock = vi.fn();
const deleteEqMock = vi.fn();
const selectMaybeSingleMock = vi.fn();

function makeFakeSupabaseClient() {
  return {
    rpc: (fn: string, params: Record<string, unknown>) => {
      rpcMock(fn, params);
      return { single: () => rpcMock.mock.results.at(-1)?.value ?? Promise.resolve({ data: null, error: null }) };
    },
    from: (table: string) => ({
      delete: () => ({
        eq: (column: string, value: string) => deleteEqMock(table, column, value),
      }),
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => selectMaybeSingleMock(table, columns, column, value),
        }),
      }),
    }),
  };
}

const createSupabaseServerClient = vi.fn(async () => makeFakeSupabaseClient());
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }));

const {
  deletePushSubscriptionForCurrentUser,
  findPushSubscriptionForCurrentUser,
  upsertPushSubscriptionForCurrentUser,
} = await import("./subscriptionStore");

const SUBSCRIPTION: RawPushSubscription = {
  endpoint: "https://push.example/e1",
  p256dh: "p256dh-key",
  auth: "auth-key",
  expirationTime: null,
};

describe("upsertPushSubscriptionForCurrentUser", () => {
  it("calls the upsert_push_subscription RPC with the subscription fields, never a client-supplied user id", async () => {
    // Reconfigure rpc to actually resolve for this call.
    const client = makeFakeSupabaseClient();
    client.rpc = (fn: string, params: Record<string, unknown>) => {
      rpcMock(fn, params);
      return {
        single: () =>
          Promise.resolve({
            data: { id: "sub_1", endpoint: SUBSCRIPTION.endpoint, p256dh: "p256dh-key", auth: "auth-key", expiration_time: null },
            error: null,
          }),
      };
    };
    createSupabaseServerClient.mockResolvedValueOnce(client);

    const result = await upsertPushSubscriptionForCurrentUser(SUBSCRIPTION);

    expect(rpcMock).toHaveBeenCalledWith("upsert_push_subscription", {
      p_endpoint: SUBSCRIPTION.endpoint,
      p_p256dh: SUBSCRIPTION.p256dh,
      p_auth: SUBSCRIPTION.auth,
      p_expiration_time: null,
    });
    const [, params] = rpcMock.mock.calls.at(-1)!;
    expect(params).not.toHaveProperty("p_user_id");
    expect(params).not.toHaveProperty("user_id");

    expect(result).toEqual({
      ok: true,
      subscription: { id: "sub_1", endpoint: SUBSCRIPTION.endpoint, p256dh: "p256dh-key", auth: "auth-key", expirationTime: null },
    });
  });

  it("converts a numeric epoch-ms expirationTime to an ISO timestamp for the RPC param", async () => {
    const client = makeFakeSupabaseClient();
    client.rpc = (fn: string, params: Record<string, unknown>) => {
      rpcMock(fn, params);
      return {
        single: () =>
          Promise.resolve({
            data: { id: "sub_1", endpoint: SUBSCRIPTION.endpoint, p256dh: "k", auth: "k", expiration_time: null },
            error: null,
          }),
      };
    };
    createSupabaseServerClient.mockResolvedValueOnce(client);

    await upsertPushSubscriptionForCurrentUser({ ...SUBSCRIPTION, expirationTime: 1750000000000 });

    const [, params] = rpcMock.mock.calls.at(-1)! as [string, { p_expiration_time: string }];
    expect(params.p_expiration_time).toBe(new Date(1750000000000).toISOString());
  });

  it("returns a failure result (never throws) when the RPC errors", async () => {
    const client = makeFakeSupabaseClient();
    client.rpc = () => ({
      single: () => Promise.resolve({ data: null, error: { message: "permission denied" } }),
    });
    createSupabaseServerClient.mockResolvedValueOnce(client);

    const result = await upsertPushSubscriptionForCurrentUser(SUBSCRIPTION);
    expect(result.ok).toBe(false);
  });
});

describe("deletePushSubscriptionForCurrentUser", () => {
  it("deletes scoped by endpoint and reports ok on success", async () => {
    deleteEqMock.mockReset().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await deletePushSubscriptionForCurrentUser("https://push.example/e1");

    expect(deleteEqMock).toHaveBeenCalledWith("push_subscriptions", "endpoint", "https://push.example/e1");
    expect(result).toEqual({ ok: true });
  });

  it("reports ok:false (never throws) when the delete errors, so callers can decide how to handle it", async () => {
    deleteEqMock.mockReset().mockResolvedValue({ error: { message: "boom" } });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await deletePushSubscriptionForCurrentUser("https://push.example/e1");
    expect(result).toEqual({ ok: false });
  });
});

describe("findPushSubscriptionForCurrentUser", () => {
  it("returns the RLS-scoped row mapped to camelCase when found", async () => {
    selectMaybeSingleMock.mockReset().mockResolvedValue({
      data: { id: "sub_1", endpoint: "https://push.example/e1", p256dh: "p", auth: "a", expiration_time: "2026-01-01T00:00:00.000Z" },
      error: null,
    });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await findPushSubscriptionForCurrentUser("https://push.example/e1");
    expect(result).toEqual({
      id: "sub_1",
      endpoint: "https://push.example/e1",
      p256dh: "p",
      auth: "a",
      expirationTime: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns null (never throws) when no row is found -- covers both 'no such row' and 'belongs to someone else' under RLS", async () => {
    selectMaybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await findPushSubscriptionForCurrentUser("https://push.example/unknown");
    expect(result).toBeNull();
  });

  it("returns null on a query error too, never throws", async () => {
    selectMaybeSingleMock.mockReset().mockResolvedValue({ data: null, error: { message: "boom" } });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await findPushSubscriptionForCurrentUser("https://push.example/e1");
    expect(result).toBeNull();
  });
});
