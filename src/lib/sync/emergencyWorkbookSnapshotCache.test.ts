import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmergencySheetSourceKey, SheetSourceKey } from "@/lib/google";

/**
 * Same faithful FAKE of `unstable_cache`/`revalidateTag` as
 * `workbookSnapshotCache.test.ts` -- see that file's own docstring for
 * why a fake (not the real Next runtime) is necessary outside a running
 * Next.js server. This file additionally exercises BOTH the regular and
 * emergency caches together against the SAME fake store, so it can prove
 * the two workbooks' snapshot keys genuinely cannot collide (spec
 * section 5/31) rather than merely asserting each cache works in
 * isolation.
 */
const { fakeUnstableCache, fakeRevalidateTag, cacheStore } = vi.hoisted(() => {
  interface CacheEntry {
    value: unknown;
    expiresAtMs: number;
    tags: string[];
  }

  const store = new Map<string, CacheEntry>();
  const nowMs = 0;

  function unstableCache(fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], options: { revalidate?: number; tags?: string[] }) {
    const fixedKey = keyParts.join(",");
    return async (...args: unknown[]) => {
      const cacheKey = `${fixedKey}:${JSON.stringify(args)}`;
      const existing = store.get(cacheKey);
      if (existing && existing.expiresAtMs > nowMs) {
        return existing.value;
      }
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
    if (!isImmediate) return;
    for (const [key, entry] of store) {
      if (entry.tags.includes(tag)) store.delete(key);
    }
  }

  return { fakeUnstableCache: unstableCache, fakeRevalidateTag: revalidateTag, cacheStore: store };
});

vi.mock("next/cache", () => ({
  unstable_cache: fakeUnstableCache,
  revalidateTag: fakeRevalidateTag,
}));

const fetchRawWorkbookSnapshot = vi.fn();
const fetchRawEmergencyWorkbookSnapshot = vi.fn();
vi.mock("@/lib/google", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google")>("@/lib/google");
  return { ...actual, fetchRawWorkbookSnapshot, fetchRawEmergencyWorkbookSnapshot };
});

const { getWorkbookSnapshot } = await import("./workbookSnapshotCache");
const { getEmergencyWorkbookSnapshot, EMERGENCY_WORKBOOK_SNAPSHOT_CACHE_TAG } = await import(
  "./emergencyWorkbookSnapshotCache"
);
const { refreshWorkbookSnapshotAction } = await import("./actions");

function snapshotAt(fetchedAt: string) {
  return { fetchedAt, sheets: [] };
}

beforeEach(() => {
  cacheStore.clear();
  fetchRawWorkbookSnapshot.mockReset();
  fetchRawEmergencyWorkbookSnapshot.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getEmergencyWorkbookSnapshot — cache reuse", () => {
  it("two calls for the same source set reuse ONE underlying Google fetch", async () => {
    fetchRawEmergencyWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-26T10:00:00.000Z"));

    await getEmergencyWorkbookSnapshot(["shifts"]);
    await getEmergencyWorkbookSnapshot(["shifts"]);

    expect(fetchRawEmergencyWorkbookSnapshot).toHaveBeenCalledTimes(1);
  });

  it("equivalent source sets in a DIFFERENT array order hit the same cache entry (canonicalization)", async () => {
    fetchRawEmergencyWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-26T10:00:00.000Z"));

    await getEmergencyWorkbookSnapshot(["shifts", "currentWeek"]);
    await getEmergencyWorkbookSnapshot(["currentWeek", "shifts"]);

    expect(fetchRawEmergencyWorkbookSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe("regular and emergency workbook snapshot caches never collide (spec section 5)", () => {
  it("identical-looking source-key sets from each workbook trigger genuinely independent fetches", async () => {
    // "personnel" (regular) vs "currentWeek"/"fairnessGroups"/"shifts" (emergency)
    // are different string unions, but the important invariant is structural:
    // the two caches live under different unstable_cache fixed keys AND
    // different tags, so nothing could accidentally alias even if a future
    // source name ever happened to collide textually.
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-26T09:00:00.000Z"));
    fetchRawEmergencyWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-26T09:05:00.000Z"));

    const regular = await getWorkbookSnapshot(["personnel" as SheetSourceKey]);
    const emergency = await getEmergencyWorkbookSnapshot(["shifts" as EmergencySheetSourceKey]);

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(fetchRawEmergencyWorkbookSnapshot).toHaveBeenCalledTimes(1);
    expect(regular.fetchedAt).toBe("2026-08-26T09:00:00.000Z");
    expect(emergency.fetchedAt).toBe("2026-08-26T09:05:00.000Z");
  });

  it("regular mode never triggers an emergency Google fetch, and vice versa", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-26T09:00:00.000Z"));

    await getWorkbookSnapshot(["personnel" as SheetSourceKey, "schedule" as SheetSourceKey]);

    expect(fetchRawEmergencyWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("the two caches store entries under structurally distinct keys/tags", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-26T09:00:00.000Z"));
    fetchRawEmergencyWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-26T09:05:00.000Z"));

    await getWorkbookSnapshot(["personnel" as SheetSourceKey]);
    await getEmergencyWorkbookSnapshot(["shifts" as EmergencySheetSourceKey]);

    const keys = [...cacheStore.keys()];
    expect(keys.some((key) => key.startsWith("workbook-snapshot:"))).toBe(true);
    expect(keys.some((key) => key.startsWith("emergency-workbook-snapshot:"))).toBe(true);
  });
});

describe("refreshWorkbookSnapshotAction — invalidates BOTH regular and emergency snapshot caches", () => {
  it("expiring both tags forces a fresh fetch for both workbooks on the next read", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotAt("2026-08-26T09:00:00.000Z"));
    fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotAt("2026-08-26T09:10:00.000Z"));
    fetchRawEmergencyWorkbookSnapshot.mockResolvedValueOnce(snapshotAt("2026-08-26T09:05:00.000Z"));
    fetchRawEmergencyWorkbookSnapshot.mockResolvedValueOnce(snapshotAt("2026-08-26T09:15:00.000Z"));

    await getWorkbookSnapshot(["personnel" as SheetSourceKey]);
    await getEmergencyWorkbookSnapshot(["shifts" as EmergencySheetSourceKey]);

    await refreshWorkbookSnapshotAction();

    const regularAfter = await getWorkbookSnapshot(["personnel" as SheetSourceKey]);
    const emergencyAfter = await getEmergencyWorkbookSnapshot(["shifts" as EmergencySheetSourceKey]);

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(2);
    expect(fetchRawEmergencyWorkbookSnapshot).toHaveBeenCalledTimes(2);
    expect(regularAfter.fetchedAt).toBe("2026-08-26T09:10:00.000Z");
    expect(emergencyAfter.fetchedAt).toBe("2026-08-26T09:15:00.000Z");
  });

  it("expiring the emergency tag when nothing was ever cached under it is a harmless no-op (never triggers an emergency fetch on its own)", async () => {
    await refreshWorkbookSnapshotAction();

    expect(fetchRawEmergencyWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("no stored entry survives with the emergency tag after refresh", async () => {
    fetchRawEmergencyWorkbookSnapshot.mockResolvedValue(snapshotAt("2026-08-26T09:05:00.000Z"));
    await getEmergencyWorkbookSnapshot(["shifts" as EmergencySheetSourceKey]);

    expect([...cacheStore.values()].some((entry) => entry.tags.includes(EMERGENCY_WORKBOOK_SNAPSHOT_CACHE_TAG))).toBe(
      true,
    );

    await refreshWorkbookSnapshotAction();

    expect([...cacheStore.values()].some((entry) => entry.tags.includes(EMERGENCY_WORKBOOK_SNAPSHOT_CACHE_TAG))).toBe(
      false,
    );
  });
});
