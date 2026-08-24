import { describe, expect, it, vi } from "vitest";

const loadNotificationCenterContext = vi.fn();

vi.mock("./notificationCenter", () => ({ loadNotificationCenterContext }));

const { getRequestNotificationCenterContext } = await import("./getRequestNotificationCenterContext");

describe("getRequestNotificationCenterContext", () => {
  it("delegates to loadNotificationCenterContext with the given needsRosterAndAdoption flag", async () => {
    loadNotificationCenterContext.mockResolvedValue({ status: "forbidden" });

    const result = await getRequestNotificationCenterContext(true);

    expect(result).toEqual({ status: "forbidden" });
    expect(loadNotificationCenterContext).toHaveBeenCalledWith(true);
  });

  it("threads false through unchanged", async () => {
    loadNotificationCenterContext.mockResolvedValue({ status: "ok", context: { roster: [], adoptionPeople: [] } });
    await getRequestNotificationCenterContext(false);
    expect(loadNotificationCenterContext).toHaveBeenCalledWith(false);
  });
});
