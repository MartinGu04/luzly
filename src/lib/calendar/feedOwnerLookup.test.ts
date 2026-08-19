import { describe, expect, it, vi } from "vitest";

const feedLookupMock = vi.fn();
const getUserByIdMock = vi.fn();

function makeFakeServiceClient() {
  return {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => feedLookupMock(table, columns, column, value),
        }),
      }),
    }),
    auth: { admin: { getUserById: (id: string) => getUserByIdMock(id) } },
  };
}

const getCalendarFeedServiceClient = vi.fn(() => makeFakeServiceClient());
vi.mock("./serviceClient", () => ({ getCalendarFeedServiceClient: () => getCalendarFeedServiceClient() }));

const { resolveCalendarFeedOwnerByToken } = await import("./feedOwnerLookup");

describe("resolveCalendarFeedOwnerByToken", () => {
  it("resolves a known token to its owner's email", async () => {
    feedLookupMock.mockReset().mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    getUserByIdMock.mockReset().mockResolvedValue({ data: { user: { email: "dani@example.com" } }, error: null });

    const result = await resolveCalendarFeedOwnerByToken("tok-1");

    expect(feedLookupMock).toHaveBeenCalledWith("calendar_feeds", "user_id", "token", "tok-1");
    expect(getUserByIdMock).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({ status: "ok", email: "dani@example.com" });
  });

  it("trims the resolved email", async () => {
    feedLookupMock.mockReset().mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    getUserByIdMock.mockReset().mockResolvedValue({ data: { user: { email: "  dani@example.com  " } }, error: null });

    expect(await resolveCalendarFeedOwnerByToken("tok-1")).toEqual({ status: "ok", email: "dani@example.com" });
  });

  it("returns not_found for an unknown token, without ever calling getUserById", async () => {
    feedLookupMock.mockReset().mockResolvedValue({ data: null, error: null });
    getUserByIdMock.mockReset();

    expect(await resolveCalendarFeedOwnerByToken("unknown")).toEqual({ status: "not_found" });
    expect(getUserByIdMock).not.toHaveBeenCalled();
  });

  it("returns not_found on a feed-lookup query error", async () => {
    feedLookupMock.mockReset().mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await resolveCalendarFeedOwnerByToken("tok-1")).toEqual({ status: "not_found" });
  });

  it("returns not_found when the token's owner no longer has an Auth record", async () => {
    feedLookupMock.mockReset().mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    getUserByIdMock.mockReset().mockResolvedValue({ data: { user: null }, error: null });

    expect(await resolveCalendarFeedOwnerByToken("tok-1")).toEqual({ status: "not_found" });
  });

  it("returns not_found when the owner's Auth record has no usable email", async () => {
    feedLookupMock.mockReset().mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    getUserByIdMock.mockReset().mockResolvedValue({ data: { user: { email: "" } }, error: null });

    expect(await resolveCalendarFeedOwnerByToken("tok-1")).toEqual({ status: "not_found" });
  });

  it("returns not_found on a getUserById error", async () => {
    feedLookupMock.mockReset().mockResolvedValue({ data: { user_id: "user-1" }, error: null });
    getUserByIdMock.mockReset().mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await resolveCalendarFeedOwnerByToken("tok-1")).toEqual({ status: "not_found" });
  });
});
