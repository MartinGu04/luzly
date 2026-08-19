import { describe, expect, it, vi } from "vitest";

const selectMaybeSingleMock = vi.fn();
const insertMock = vi.fn();
const updateEqSelectMaybeSingleMock = vi.fn();
const deleteEqMock = vi.fn();

function makeFakeSupabaseClient() {
  return {
    from: (table: string) => ({
      select: (columns: string) => ({
        maybeSingle: () => selectMaybeSingleMock(table, columns),
      }),
      insert: (row: Record<string, unknown>) => insertMock(table, row),
      update: (values: Record<string, unknown>) => ({
        eq: (column: string, value: string) => ({
          select: (columns: string) => ({
            maybeSingle: () => updateEqSelectMaybeSingleMock(table, values, column, value, columns),
          }),
        }),
      }),
      delete: () => ({
        eq: (column: string, value: string) => deleteEqMock(table, column, value),
      }),
    }),
  };
}

const createSupabaseServerClient = vi.fn(async () => makeFakeSupabaseClient());
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }));
vi.mock("./token", () => ({ generateCalendarFeedToken: () => "generated-token" }));

const {
  getCalendarFeedForCurrentUser,
  enableCalendarFeedForCurrentUser,
  resetCalendarFeedForCurrentUser,
  disableCalendarFeedForCurrentUser,
} = await import("./feedStore");

const USER_ID = "user-1";

describe("getCalendarFeedForCurrentUser", () => {
  it("returns enabled:true with the RLS-scoped row's token when a row exists", async () => {
    selectMaybeSingleMock.mockReset().mockResolvedValue({ data: { token: "tok-1" }, error: null });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await getCalendarFeedForCurrentUser();
    expect(result).toEqual({ enabled: true, token: "tok-1" });
  });

  it("returns enabled:false, token:null when no row exists", async () => {
    selectMaybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    expect(await getCalendarFeedForCurrentUser()).toEqual({ enabled: false, token: null });
  });

  it("returns enabled:false, token:null on a query error too, never throws", async () => {
    selectMaybeSingleMock.mockReset().mockResolvedValue({ data: null, error: { message: "boom" } });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    expect(await getCalendarFeedForCurrentUser()).toEqual({ enabled: false, token: null });
  });
});

describe("enableCalendarFeedForCurrentUser", () => {
  it("is idempotent: returns the EXISTING token unchanged when a row already exists, never inserts", async () => {
    selectMaybeSingleMock.mockReset().mockResolvedValue({ data: { token: "existing-tok" }, error: null });
    insertMock.mockReset();
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await enableCalendarFeedForCurrentUser(USER_ID);

    expect(result).toEqual({ ok: true, token: "existing-tok" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts a freshly generated token scoped to userId when no row exists", async () => {
    selectMaybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
    insertMock.mockReset().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await enableCalendarFeedForCurrentUser(USER_ID);

    expect(insertMock).toHaveBeenCalledWith("calendar_feeds", { user_id: USER_ID, token: "generated-token" });
    expect(result).toEqual({ ok: true, token: "generated-token" });
  });

  it("reports ok:false (never throws) when the insert fails", async () => {
    selectMaybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
    insertMock.mockReset().mockResolvedValue({ error: { message: "unique violation" } });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await enableCalendarFeedForCurrentUser(USER_ID);
    expect(result).toEqual({ ok: false });
  });
});

describe("resetCalendarFeedForCurrentUser", () => {
  it("updates the token scoped to userId and returns the new token", async () => {
    updateEqSelectMaybeSingleMock.mockReset().mockResolvedValue({ data: { token: "generated-token" }, error: null });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await resetCalendarFeedForCurrentUser(USER_ID);

    expect(updateEqSelectMaybeSingleMock).toHaveBeenCalledWith(
      "calendar_feeds",
      expect.objectContaining({ token: "generated-token" }),
      "user_id",
      USER_ID,
      "token",
    );
    expect(result).toEqual({ ok: true, token: "generated-token" });
  });

  it("fails with reason 'not_enabled' (never creates a row) when the user has no existing feed", async () => {
    updateEqSelectMaybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await resetCalendarFeedForCurrentUser(USER_ID);
    expect(result).toEqual({ ok: false, reason: "not_enabled" });
  });

  it("fails with reason 'update_failed' (never throws) on a query error", async () => {
    updateEqSelectMaybeSingleMock.mockReset().mockResolvedValue({ data: null, error: { message: "boom" } });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await resetCalendarFeedForCurrentUser(USER_ID);
    expect(result).toEqual({ ok: false, reason: "update_failed" });
  });
});

describe("disableCalendarFeedForCurrentUser", () => {
  it("deletes scoped to userId and reports ok on success", async () => {
    deleteEqMock.mockReset().mockResolvedValue({ error: null });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await disableCalendarFeedForCurrentUser(USER_ID);

    expect(deleteEqMock).toHaveBeenCalledWith("calendar_feeds", "user_id", USER_ID);
    expect(result).toEqual({ ok: true });
  });

  it("reports ok:false (never throws) when the delete errors -- idempotent either way", async () => {
    deleteEqMock.mockReset().mockResolvedValue({ error: { message: "boom" } });
    createSupabaseServerClient.mockResolvedValueOnce(makeFakeSupabaseClient());

    const result = await disableCalendarFeedForCurrentUser(USER_ID);
    expect(result).toEqual({ ok: false });
  });
});
