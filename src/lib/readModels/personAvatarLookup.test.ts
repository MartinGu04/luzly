import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";

/**
 * A small, faithful FAKE of `unstable_cache`'s observable contract (reuse
 * within a TTL, keyed by the fixed keyParts since this function takes no
 * arguments) -- same convention/reasoning as
 * `lib/sync/workbookSnapshotCache.test.ts`'s own fake: the real
 * `unstable_cache` throws outside an actual running Next.js server.
 */
const { fakeUnstableCache, cacheStore, advanceFakeClockMs } = vi.hoisted(() => {
  const store = new Map<string, { value: unknown; expiresAtMs: number }>();
  let nowMs = 0;

  function unstableCache(fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], options: { revalidate?: number }) {
    const fixedKey = keyParts.join(",");
    return async (...args: unknown[]) => {
      const cacheKey = `${fixedKey}:${JSON.stringify(args)}`;
      const existing = store.get(cacheKey);
      if (existing && existing.expiresAtMs > nowMs) return existing.value;
      const value = await fn(...args);
      store.set(cacheKey, { value, expiresAtMs: nowMs + (options.revalidate ?? Infinity) * 1000 });
      return value;
    };
  }

  return {
    fakeUnstableCache: unstableCache,
    cacheStore: store,
    advanceFakeClockMs: (ms: number) => {
      nowMs += ms;
    },
  };
});

vi.mock("next/cache", () => ({ unstable_cache: fakeUnstableCache }));

const fetchAllUserIdsByEmail = vi.fn();
vi.mock("@/lib/notifications/engine/recipients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/engine/recipients")>();
  return { ...actual, fetchAllUserIdsByEmail };
});

const { fetchEmailToAvatarUrl, resolveAvatarUrlsByPersonId } = await import("./personAvatarLookup");

function person(overrides: Partial<Person> & Pick<Person, "id" | "name">): Person {
  return { email: null, isManager: false, isTechnician: false, isSupervisor: false, personnelType: null, ...overrides };
}

beforeEach(() => {
  cacheStore.clear();
  fetchAllUserIdsByEmail.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("fetchEmailToAvatarUrl", () => {
  it("returns every account's avatar URL, keyed by normalized email", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(
      new Map([
        ["dani@example.com", { userId: "user-1", avatarUrl: "https://lh3.googleusercontent.com/a/dani.jpg" }],
        ["noa@example.com", { userId: "user-2", avatarUrl: null }],
      ]),
    );

    const result = await fetchEmailToAvatarUrl();

    expect(result.get("dani@example.com")).toBe("https://lh3.googleusercontent.com/a/dani.jpg");
    expect(result.get("noa@example.com")).toBeNull();
  });

  it("never carries userId or anything beyond the avatar URL through to its result", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(
      new Map([["dani@example.com", { userId: "user-1", avatarUrl: "https://lh3.googleusercontent.com/a/dani.jpg" }]]),
    );
    const result = await fetchEmailToAvatarUrl();
    // The Map's own value type is `string | null` -- structurally, there is no userId to read.
    expect(result.get("dani@example.com")).toBe("https://lh3.googleusercontent.com/a/dani.jpg");
    expect([...result.values()].every((value) => typeof value === "string" || value === null)).toBe(true);
  });

  it("caches across calls within the TTL -- avoids an N+1 Admin API call per Fairness page view", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(new Map());

    await fetchEmailToAvatarUrl();
    await fetchEmailToAvatarUrl();
    await fetchEmailToAvatarUrl();

    expect(fetchAllUserIdsByEmail).toHaveBeenCalledTimes(1);
  });

  it("refreshes with a genuinely new Admin API call once the cache TTL elapses", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(new Map());
    await fetchEmailToAvatarUrl();
    advanceFakeClockMs(31_000);
    await fetchEmailToAvatarUrl();

    expect(fetchAllUserIdsByEmail).toHaveBeenCalledTimes(2);
  });
});

describe("resolveAvatarUrlsByPersonId", () => {
  it("matches a person to their avatar via their (normalized) email", async () => {
    const people = [person({ id: "p1", name: "Dani", email: "  Dani@Example.com  " })];
    const emailToAvatarUrl = new Map([["dani@example.com", "https://lh3.googleusercontent.com/a/dani.jpg"]]);

    const result = resolveAvatarUrlsByPersonId(people, emailToAvatarUrl);

    expect(result.get("p1")).toBe("https://lh3.googleusercontent.com/a/dani.jpg");
  });

  it("returns null for a person whose email has no matching Supabase account", () => {
    const people = [person({ id: "p1", name: "Ghost", email: "ghost@example.com" })];
    const result = resolveAvatarUrlsByPersonId(people, new Map());
    expect(result.get("p1")).toBeNull();
  });

  it("skips (no entry at all) a person with no email", () => {
    const people = [person({ id: "p1", name: "No Email" })];
    const result = resolveAvatarUrlsByPersonId(people, new Map([["someone@example.com", "https://x/y.jpg"]]));
    expect(result.has("p1")).toBe(false);
  });

  it("never attributes a photo to EITHER person when two roster records share a normalized email -- fails closed, never a coin-flip guess", () => {
    const people = [
      person({ id: "p1", name: "First", email: "shared@example.com" }),
      person({ id: "p2", name: "Second", email: " Shared@Example.com " }),
    ];
    const emailToAvatarUrl = new Map([["shared@example.com", "https://lh3.googleusercontent.com/a/shared.jpg"]]);

    const result = resolveAvatarUrlsByPersonId(people, emailToAvatarUrl);

    expect(result.has("p1")).toBe(false);
    expect(result.has("p2")).toBe(false);
  });

  it("never cross-attributes photos across two DIFFERENT, unambiguous people", () => {
    const people = [
      person({ id: "p1", name: "Dani", email: "dani@example.com" }),
      person({ id: "p2", name: "Noa", email: "noa@example.com" }),
    ];
    const emailToAvatarUrl = new Map([
      ["dani@example.com", "https://lh3.googleusercontent.com/a/dani.jpg"],
      ["noa@example.com", "https://lh3.googleusercontent.com/a/noa.jpg"],
    ]);

    const result = resolveAvatarUrlsByPersonId(people, emailToAvatarUrl);

    expect(result.get("p1")).toBe("https://lh3.googleusercontent.com/a/dani.jpg");
    expect(result.get("p2")).toBe("https://lh3.googleusercontent.com/a/noa.jpg");
  });
});
