import { describe, expect, it, vi } from "vitest";

const loadPersonalScheduleReadModel = vi.fn();

vi.mock("./personalSchedule", () => ({ loadPersonalScheduleReadModel }));

const { getRequestPersonalSchedule } = await import("./getRequestPersonalSchedule");

/**
 * True request-scoped deduplication comes from React's `cache()` dispatcher,
 * which only exists inside an actual Server Component render (Next.js sets
 * it up per request) -- calling a `cache()`-wrapped function directly in a
 * plain Node/Vitest process (as here) executes it every time, with no
 * dispatcher to memoize against. That's confirmed correct: it means this
 * suite can verify `getRequestPersonalSchedule` correctly delegates to
 * `loadPersonalScheduleReadModel`, while the actual cross-call
 * deduplication guarantee is enforced structurally (see
 * `requestScopedLoader.test.ts`: only this wrapper may be imported by the
 * layout/page, so Next's real per-request cache is what dedupes them).
 */
describe("getRequestPersonalSchedule", () => {
  it("delegates to loadPersonalScheduleReadModel and returns its result", async () => {
    loadPersonalScheduleReadModel.mockResolvedValue({ status: "unauthenticated" });

    const result = await getRequestPersonalSchedule();

    expect(result).toEqual({ status: "unauthenticated" });
    expect(loadPersonalScheduleReadModel).toHaveBeenCalledTimes(1);
  });

  it("takes no arguments -- identity always comes from the request's own cookies, never a caller-supplied value", () => {
    expect(getRequestPersonalSchedule.length).toBe(0);
  });
});
