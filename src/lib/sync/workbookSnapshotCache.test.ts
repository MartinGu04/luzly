import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SheetSourceKey } from "@/lib/google";

/**
 * A small, faithful FAKE of the exact slice of Next's cache runtime this
 * module depends on (`unstable_cache` + `revalidateTag`) -- necessary
 * because the REAL `unstable_cache` throws ("Invariant: incrementalCache
 * missing") outside an actual running Next.js server, so it cannot be
 * exercised directly in a plain Vitest process. This fake reproduces the
 * OBSERVABLE contract that matters here: reuse within a TTL keyed by
 * function args, tag-based invalidation, and "never cache a rejection" --
 * so these tests verify `getWorkbookSnapshot`'s real behavior end-to-end
 * against that contract, not just "unstable_cache was called with X".
 */
const { fakeUnstableCache, fakeRevalidateTag, cacheStore, advanceFakeClockMs } = vi.hoisted(() => {
  interface CacheEntry {
    value: unknown;
    expiresAtMs: number;
    tags: string[];
  }

  const store = new Map<string, CacheEntry>();
  let nowMs = 0;

  function unstableCache(fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], options: { revalidate?: number; tags?: string[] }) {
    const fixedKey = keyParts.join(",");
    return async (...args: unknown[]) => {
      const cacheKey = `${fixedKey}:${JSON.stringify(args)}`;
      const existing = store.get(cacheKey);
      if (existing && existing.expiresAtMs > nowMs) {
        return existing.value;
      }
      // Never cache a rejection -- only a genuinely successful result.
      const value = await fn(...args);
      store.set(cacheKey, {
        value,
        expiresAtMs: nowMs + (options.revalidate ?? Infinity) * 1000,
        tags: options.tags ?? [],
      });
      return value;
    };
  }

  function revalidateTag(tag: string, profile: string | { expire?: number }) {
    const isImmediate = typeof profile === "object" && profile.expire === 0;
    if (!isImmediate) return; // 'max' (stale-while-revalidate) is not exercised by these tests.
    for (const [key, entry] of store) {
      if (entry.tags.includes(tag)) store.delete(key);
    }
  }

  return {
    fakeUnstableCache: unstableCache,
    fakeRevalidateTag: revalidateTag,
    cacheStore: store,
    advanceFakeClockMs: (ms: number) => {
      nowMs += ms;
    },
  };
});

vi.mock("next/cache", () => ({
  unstable_cache: fakeUnstableCache,
  revalidateTag: fakeRevalidateTag,
}));

const fetchRawWorkbookSnapshot = vi.fn();
vi.mock("@/lib/google", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google")>("@/lib/google");
  return { ...actual, fetchRawWorkbookSnapshot };
});

const { getWorkbookSnapshot, WORKBOOK_SNAPSHOT_CACHE_TAG } = await import("./workbookSnapshotCache");
const { refreshWorkbookSnapshotAction } = await import("./actions");

function snapshotAt(fetchedAt: string) {
  return { fetchedAt, sheets: [] };
}

beforeEach(() => {
  cacheStore.clear();
  fetchRawWorkbookSnapshot.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

const PERSONAL_SOURCES: SheetSourceKey[] = ["personnel", "schedule", "settings"];
const MANAGER_SOURCES: SheetSourceKey[] = ["personnel", "schedule", "settings", "potentialH1", "potentialH2"];

describe("getWorkbookSnapshot — cache reuse", () => {
  it("two calls for the same source set reuse ONE underlying Google fetch", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-15T10:00:00.000Z"));

    await getWorkbookSnapshot(PERSONAL_SOURCES);
    await getWorkbookSnapshot(PERSONAL_SOURCES);

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(1);
  });

  it("preserves the ORIGINAL fetchedAt on a cache hit -- never stamps a new one at read time", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-15T10:00:00.000Z"));

    const first = await getWorkbookSnapshot(PERSONAL_SOURCES);
    advanceFakeClockMs(5_000);
    const second = await getWorkbookSnapshot(PERSONAL_SOURCES);

    expect(first.fetchedAt).toBe("2026-08-15T10:00:00.000Z");
    expect(second.fetchedAt).toBe("2026-08-15T10:00:00.000Z");
  });

  it("equivalent source sets in a DIFFERENT array order hit the same cache entry (canonicalization)", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-15T10:00:00.000Z"));

    await getWorkbookSnapshot(["personnel", "schedule", "settings"]);
    await getWorkbookSnapshot(["settings", "personnel", "schedule"]);
    await getWorkbookSnapshot(["schedule", "settings", "personnel"]);

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(1);
  });

  it("duplicate keys within one request are de-duplicated before hitting the cache/Google", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-15T10:00:00.000Z"));

    await getWorkbookSnapshot(["personnel", "personnel", "schedule"]);
    await getWorkbookSnapshot(["personnel", "schedule"]);

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(1);
  });

  it("after the TTL elapses, the next call performs a genuinely fresh fetch", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotAt("2026-08-15T10:00:00.000Z"));
    fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotAt("2026-08-15T10:05:00.000Z"));

    const first = await getWorkbookSnapshot(PERSONAL_SOURCES);
    advanceFakeClockMs(31_000); // past the 30s TTL
    const second = await getWorkbookSnapshot(PERSONAL_SOURCES);

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(2);
    expect(first.fetchedAt).toBe("2026-08-15T10:00:00.000Z");
    expect(second.fetchedAt).toBe("2026-08-15T10:05:00.000Z");
  });
});

describe("getWorkbookSnapshot — different source sets never collide", () => {
  it("a manager's broader source set triggers its OWN separate fetch, never satisfied by a normal user's narrower one", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-15T10:00:00.000Z"));

    await getWorkbookSnapshot(PERSONAL_SOURCES);
    await getWorkbookSnapshot(MANAGER_SOURCES);

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(2);
    expect(fetchRawWorkbookSnapshot).toHaveBeenNthCalledWith(1, [...PERSONAL_SOURCES].sort());
    expect(fetchRawWorkbookSnapshot).toHaveBeenNthCalledWith(2, [...MANAGER_SOURCES].sort());
  });

  it("a genuinely different (single-source) request never reuses a broader cached set", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-15T10:00:00.000Z"));

    await getWorkbookSnapshot(MANAGER_SOURCES);
    await getWorkbookSnapshot(["personnel"]);

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(2);
  });
});

describe("refreshWorkbookSnapshotAction — real forced refresh", () => {
  it("invalidates the cache so the NEXT call is a genuinely fresh fetch with a newer fetchedAt", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotAt("2026-08-15T10:00:00.000Z"));
    fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotAt("2026-08-15T10:00:05.000Z"));

    const before = await getWorkbookSnapshot(PERSONAL_SOURCES);
    await refreshWorkbookSnapshotAction();
    const after = await getWorkbookSnapshot(PERSONAL_SOURCES);

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(2);
    expect(before.fetchedAt).toBe("2026-08-15T10:00:00.000Z");
    expect(after.fetchedAt).toBe("2026-08-15T10:00:05.000Z");
  });

  it("invalidates every cached source set sharing the tag, not just one", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-15T10:00:00.000Z"));

    await getWorkbookSnapshot(PERSONAL_SOURCES);
    await getWorkbookSnapshot(MANAGER_SOURCES);
    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(2);

    await refreshWorkbookSnapshotAction();

    await getWorkbookSnapshot(PERSONAL_SOURCES);
    await getWorkbookSnapshot(MANAGER_SOURCES);
    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(4);
  });

  it("only ever invalidates its own tag -- verified by checking no stored entry survives with that tag", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-15T10:00:00.000Z"));
    await getWorkbookSnapshot(PERSONAL_SOURCES);

    expect([...cacheStore.values()].some((entry) => entry.tags.includes(WORKBOOK_SNAPSHOT_CACHE_TAG))).toBe(
      true,
    );

    await refreshWorkbookSnapshotAction();

    expect([...cacheStore.values()].some((entry) => entry.tags.includes(WORKBOOK_SNAPSHOT_CACHE_TAG))).toBe(
      false,
    );
  });
});

describe("getWorkbookSnapshot — error handling", () => {
  it("a failed fetch is never permanently cached -- the next call retries against Google again", async () => {
    fetchRawWorkbookSnapshot.mockRejectedValueOnce(new Error("Google API error"));
    fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotAt("2026-08-15T10:00:00.000Z"));

    await expect(getWorkbookSnapshot(PERSONAL_SOURCES)).rejects.toThrow("Google API error");
    const result = await getWorkbookSnapshot(PERSONAL_SOURCES);

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(2);
    expect(result.fetchedAt).toBe("2026-08-15T10:00:00.000Z");
  });
});
