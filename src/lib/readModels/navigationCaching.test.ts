import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";

/**
 * A faithful FAKE of the exact slice of Next's cache runtime
 * `lib/sync/workbookSnapshotCache.ts` depends on -- see the identical
 * fake in `lib/sync/workbookSnapshotCache.test.ts` for the full
 * rationale (the real `unstable_cache` cannot run outside an actual
 * Next.js server). This file exercises the REAL `getWorkbookSnapshot` +
 * `loadPersonalScheduleReadModel` together (only `getAuthenticatedIdentity`
 * and the underlying `fetchRawWorkbookSnapshot` Google call are mocked),
 * to prove the actual end-to-end claim: a realistic multi-page
 * authenticated navigation sequence performs ONE real Google fetch, not
 * one per page.
 */
const { fakeUnstableCache, fakeRevalidateTag } = vi.hoisted(() => {
  interface CacheEntry {
    value: unknown;
    expiresAtMs: number;
    tags: string[];
  }
  const store = new Map<string, CacheEntry>();
  const nowMs = 0;

  function unstableCache(
    fn: (...args: unknown[]) => Promise<unknown>,
    keyParts: string[],
    options: { revalidate?: number; tags?: string[] },
  ) {
    const fixedKey = keyParts.join(",");
    return async (...args: unknown[]) => {
      const cacheKey = `${fixedKey}:${JSON.stringify(args)}`;
      const existing = store.get(cacheKey);
      if (existing && existing.expiresAtMs > nowMs) return existing.value;
      const value = await fn(...args);
      store.set(cacheKey, { value, expiresAtMs: nowMs + (options.revalidate ?? Infinity) * 1000, tags: options.tags ?? [] });
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

  return { fakeUnstableCache: unstableCache, fakeRevalidateTag: revalidateTag };
});

vi.mock("next/cache", () => ({ unstable_cache: fakeUnstableCache, revalidateTag: fakeRevalidateTag }));

const getAuthenticatedIdentity = vi.fn();
const fetchRawWorkbookSnapshot = vi.fn();
const getJerusalemLocalNow = vi.fn();

vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));
vi.mock("@/lib/google", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google")>("@/lib/google");
  return { ...actual, fetchRawWorkbookSnapshot };
});
vi.mock("@/lib/time/jerusalemClock", () => ({ getJerusalemLocalNow }));

const { loadPersonalScheduleReadModel } = await import("./personalSchedule");

function personnelSheet(rows: string[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}
function scheduleSheet(rows: (string | number)[][]): RawSheet {
  return { name: "משמרות + תורנויות", values: rows };
}
function settingsSheet(rows: string[][]): RawSheet {
  return { name: "הגדרות", values: rows };
}

const PERSONNEL_ROWS = [
  ["שם", "מייל"],
  ["דני בדיקה", "dani@example.invalid"],
];
const SETTINGS_ROWS_VALID = [
  ["הגדרה", "ערך"],
  ["תחילת משמרת יום", "07:30"],
];

function validSnapshot(fetchedAt: string) {
  return {
    fetchedAt,
    sheets: [scheduleSheet([]), settingsSheet(SETTINGS_ROWS_VALID), personnelSheet(PERSONNEL_ROWS)],
  };
}

beforeEach(() => {
  getAuthenticatedIdentity.mockReset();
  fetchRawWorkbookSnapshot.mockReset();
  getJerusalemLocalNow.mockReset();
  getJerusalemLocalNow.mockReturnValue({ date: "2026-08-12", minuteOfDay: 600 });
  getAuthenticatedIdentity.mockResolvedValue({
    status: "authenticated",
    userId: "u1",
    email: "dani@example.invalid",
    avatarUrl: null,
  });
  fetchRawWorkbookSnapshot.mockResolvedValue(validSnapshot("2026-08-15T10:00:00.000Z"));
});

describe("Realistic navigation sequence — היום שלי → משמרות → מי איתי → תורנויות → התנגשויות → היום שלי", () => {
  it("6 separate page loads (6 separate loadPersonalScheduleReadModel calls, simulating 6 separate requests) perform exactly ONE real Google fetch", async () => {
    for (let i = 0; i < 6; i++) {
      const result = await loadPersonalScheduleReadModel();
      expect(result.status).toBe("ok");
    }

    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(1);
  });

  it("every page in the sequence sees the SAME fetchedAt -- the freshness label stays honest about when Google was actually last read", async () => {
    const fetchedAtValues: string[] = [];
    for (let i = 0; i < 6; i++) {
      const result = await loadPersonalScheduleReadModel();
      if (result.status === "ok") fetchedAtValues.push(result.model.fetchedAt);
    }

    expect(fetchedAtValues).toHaveLength(6);
    expect(new Set(fetchedAtValues).size).toBe(1);
    expect(fetchedAtValues[0]).toBe("2026-08-15T10:00:00.000Z");
  });
});
