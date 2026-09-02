import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet, RawWorkbookSnapshot, SheetSourceKey } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { buildReportOneDraft } from "@/lib/domain/reportOne";
import type { Person } from "@/lib/domain/types";

/**
 * GENUINE reproduction of the reported production mismatch (schedule UI
 * shows `אחמ"ש יום - צל`, Report 1 shows `טכנאי יום` for the same date/
 * person), narrowed to its actual root cause: `getWorkbookSnapshot`'s
 * canonical-source-set cache key, NOT parsing/classification (already
 * separately proven correct, byte-for-byte, in
 * `reportOneShadowRoleRawPipelineRegression.test.ts`).
 *
 * Reuses the SAME faithful fake `unstable_cache`/`revalidateTag` harness
 * `workbookSnapshotCache.test.ts` already established (see that file's own
 * docstring for why: the REAL `unstable_cache` throws outside a running
 * Next.js server) -- this file adds a fake clock and a scripted
 * `fetchRawWorkbookSnapshot` sequence (pre-edit content, then post-edit
 * content, simulating a manager editing the sheet between two reads) on
 * top of it, then runs each resulting snapshot through the SAME
 * production pipeline (`parseScheduleSheet` -> `parseEvent` ->
 * `buildReportOneDraft`) the two real loaders use, so this proves an
 * actual DISPLAYED-TEXT mismatch, never merely "two different byte blobs
 * were cached."
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

const { getWorkbookSnapshot } = await import("./workbookSnapshotCache");
const { SHEET_SOURCES } = await import("@/lib/google");

beforeEach(() => {
  cacheStore.clear();
  fetchRawWorkbookSnapshot.mockReset();
});

// --- Fixture: the real "schedule" sheet, one manager column, one date row.

function syntheticPerson(name: string, overrides: Partial<Person> = {}): Person {
  return {
    id: `id_${name}`,
    name,
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: "חובה",
    ...overrides,
  };
}

const MANAGER = syntheticPerson("עילאי שפירא", { isSupervisor: true });

/** The "schedule" RawSheet with `cellText` in the shift-manager's own cell for 03/09/2026 -- the exact shape `parseScheduleSheet` (and both real loaders) consume. */
function scheduleRawSheet(cellText: string): RawSheet {
  return {
    name: SHEET_SOURCES.schedule,
    values: [
      ["תאריך", "יום", MANAGER.name],
      ["03/09/2026", "ה", cellText],
    ],
  };
}

function snapshotWithScheduleCell(cellText: string, fetchedAt: string): RawWorkbookSnapshot {
  return { fetchedAt, sheets: [scheduleRawSheet(cellText)] };
}

/** Runs the SAME production pipeline both real loaders use, on whatever `snapshot` genuinely holds -- never a hand-built Event. */
function reportOneStatusFor(snapshot: RawWorkbookSnapshot): string | undefined {
  const scheduleSheet = snapshot.sheets.find((s) => s.name === SHEET_SOURCES.schedule)!;
  const rawAssignments = parseScheduleSheet(scheduleSheet, [MANAGER]);
  const events = rawAssignments.map(parseEvent);
  const draft = buildReportOneDraft({ people: [MANAGER], events, targetDate: "2026-09-03", prevDate: "2026-09-02" });
  return draft.sections.flatMap((s) => s.people).find((p) => p.personId === MANAGER.id)?.generatedStatus;
}

const PRE_EDIT_CELL = "טכנאי יום"; // the manager's PREVIOUS assignment, before being reassigned to shadow
const POST_EDIT_CELL = 'אחמ"ש יום - צל'; // what the schedule UI visibly shows after the edit

// The OLD, pre-fix source sets (SCHEDULE_MANAGER_SOURCES before this PR's change).
const SCHEDULE_SOURCES_OLD: SheetSourceKey[] = ["personnel", "schedule", "settings", "potentialH1", "potentialH2"];
// The NEW, post-fix SCHEDULE_MANAGER_SOURCES (this PR's change: + "shootingRanges").
const SCHEDULE_SOURCES_NEW: SheetSourceKey[] = ["personnel", "schedule", "settings", "potentialH1", "potentialH2", "shootingRanges"];
// MANAGER_WORKBOOK_SOURCES (Report 1 / Manager Overview / Home) -- unchanged throughout.
const MANAGER_WORKBOOK_SOURCES: SheetSourceKey[] = ["personnel", "schedule", "settings", "potentialH1", "potentialH2", "shootingRanges"];

describe("Schedule vs. Report 1 cache-key divergence -- genuine reproduction and fix proof", () => {
  it(
    "1. BEFORE the fix: two different canonical source sets can each independently cache the SAME schedule sheet, " +
      "so the schedule page and Report 1 can render genuinely DIFFERENT text for the identical cell",
    async () => {
      // t=0: Report 1 (MANAGER_WORKBOOK_SOURCES) is opened first, BEFORE the manager's edit --
      // caches the pre-edit content under its own canonical key.
      fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotWithScheduleCell(PRE_EDIT_CELL, "2026-09-03T10:00:00.000Z"));
      const reportOneSnapshotBeforeEdit = await getWorkbookSnapshot(MANAGER_WORKBOOK_SOURCES);
      expect(reportOneStatusFor(reportOneSnapshotBeforeEdit)).toBe("נוכח, טכנאי יום");

      // t=5s: the manager edits the cell in Google Sheets. Nothing in THIS
      // process observes that directly -- only the NEXT genuinely fresh
      // Google fetch will see it.
      advanceFakeClockMs(5_000);
      fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotWithScheduleCell(POST_EDIT_CELL, "2026-09-03T10:00:05.000Z"));

      // t=5s: the manager immediately opens /schedule. SCHEDULE_SOURCES_OLD
      // has NEVER been cached before (different canonical key from
      // MANAGER_WORKBOOK_SOURCES -- no "shootingRanges") -- so this is
      // necessarily a fresh fetch, correctly picking up the edit.
      const scheduleSnapshotAfterEdit = await getWorkbookSnapshot(SCHEDULE_SOURCES_OLD);
      expect(reportOneStatusFor(scheduleSnapshotAfterEdit)).toBe('נוכח, אחמ"ש יום');

      // t=5s: the manager then re-checks Report 1 (MANAGER_WORKBOOK_SOURCES).
      // Its OWN cache entry is only 5s old -- well inside the 30s TTL -- so
      // this is a CACHE HIT, silently serving the stale pre-edit reading.
      const reportOneSnapshotAfterEdit = await getWorkbookSnapshot(MANAGER_WORKBOOK_SOURCES);
      expect(reportOneStatusFor(reportOneSnapshotAfterEdit)).toBe("נוכח, טכנאי יום"); // STALE

      // The exact reported symptom, reproduced end to end: the schedule page
      // and Report 1 disagree about the SAME cell at the SAME real moment.
      expect(reportOneStatusFor(scheduleSnapshotAfterEdit)).not.toBe(reportOneStatusFor(reportOneSnapshotAfterEdit));
      expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(2); // two genuinely independent Google reads
    },
  );

  it(
    "2. AFTER the fix: SCHEDULE_MANAGER_SOURCES (+shootingRanges) resolves to the SAME canonical cache entry as " +
      "MANAGER_WORKBOOK_SOURCES, so the two consumers CANNOT diverge in the identical scenario",
    async () => {
      fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotWithScheduleCell(PRE_EDIT_CELL, "2026-09-03T10:00:00.000Z"));
      const reportOneSnapshotBeforeEdit = await getWorkbookSnapshot(MANAGER_WORKBOOK_SOURCES);
      expect(reportOneStatusFor(reportOneSnapshotBeforeEdit)).toBe("נוכח, טכנאי יום");

      advanceFakeClockMs(5_000);
      // A second scripted response exists (in case a second fetch WERE
      // triggered), so if this test's OWN premise were wrong, it would
      // fail loudly on a wrong status rather than passing vacuously.
      fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotWithScheduleCell(POST_EDIT_CELL, "2026-09-03T10:00:05.000Z"));

      // The manager opens /schedule -- SCHEDULE_SOURCES_NEW's canonical key
      // (sorted+deduped) is now IDENTICAL to MANAGER_WORKBOOK_SOURCES', so
      // this is a CACHE HIT against the entry Report 1 already populated --
      // never a second Google fetch, never a chance to observe the edit
      // ahead of Report 1.
      const scheduleSnapshotAfterEdit = await getWorkbookSnapshot(SCHEDULE_SOURCES_NEW);
      const reportOneSnapshotAfterEdit = await getWorkbookSnapshot(MANAGER_WORKBOOK_SOURCES);

      expect(reportOneStatusFor(scheduleSnapshotAfterEdit)).toBe("נוכח, טכנאי יום"); // consistently stale...
      expect(reportOneStatusFor(reportOneSnapshotAfterEdit)).toBe("נוכח, טכנאי יום"); // ...on BOTH sides, together

      // The invariant this fix actually buys: NEVER a disagreement between
      // the two, in this scenario -- either both are fresh or both are
      // (consistently, briefly) stale, but never split.
      expect(reportOneStatusFor(scheduleSnapshotAfterEdit)).toBe(reportOneStatusFor(reportOneSnapshotAfterEdit));
      expect(scheduleSnapshotAfterEdit.fetchedAt).toBe(reportOneSnapshotAfterEdit.fetchedAt);
      expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(1); // ONE shared underlying Google read, not two
    },
  );

  it("3. after the fix, once EITHER consumer's shared entry naturally expires (30s TTL) and is next touched, BOTH immediately see the edit together", async () => {
    fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotWithScheduleCell(PRE_EDIT_CELL, "2026-09-03T10:00:00.000Z"));
    await getWorkbookSnapshot(MANAGER_WORKBOOK_SOURCES);

    advanceFakeClockMs(31_000); // past the shared 30s TTL
    fetchRawWorkbookSnapshot.mockResolvedValueOnce(snapshotWithScheduleCell(POST_EDIT_CELL, "2026-09-03T10:00:31.000Z"));

    const scheduleSnapshot = await getWorkbookSnapshot(SCHEDULE_SOURCES_NEW);
    expect(reportOneStatusFor(scheduleSnapshot)).toBe('נוכח, אחמ"ש יום');

    // Report 1's own call, immediately after, reuses that SAME just-refreshed entry.
    const reportOneSnapshot = await getWorkbookSnapshot(MANAGER_WORKBOOK_SOURCES);
    expect(reportOneStatusFor(reportOneSnapshot)).toBe('נוכח, אחמ"ש יום');
    expect(fetchRawWorkbookSnapshot).toHaveBeenCalledTimes(2); // one pre-edit fetch, one post-TTL refresh -- shared by both
  });
});
