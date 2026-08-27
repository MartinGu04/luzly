import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  fetchRawEmergencyWorkbookSnapshot,
  type EmergencySheetSourceKey,
  type RawWorkbookSnapshot,
} from "@/lib/google";
import { timedStage } from "@/lib/config/timingDiagnostics";

/**
 * The EMERGENCY workbook's own snapshot cache -- a fully separate module
 * from `workbookSnapshotCache.ts`, not a widened version of it. This is
 * deliberate, not incidental: `SheetSourceKey` has no workbook-identity
 * dimension, so a shared cache keyed only on source-key set could let a
 * regular `["personnel","settings"]` request and an emergency one
 * accidentally resolve to the same entry the moment their (differently-
 * typed, but structurally similar) source-key strings happened to
 * coincide. Giving the emergency workbook its own fixed `unstable_cache`
 * key part (`["emergency-workbook-snapshot"]`, distinct from
 * `["workbook-snapshot"]`) and its own cache TAG makes the two caches
 * structurally unable to collide, rather than relying on every future
 * caller to remember to disambiguate by hand.
 */
export const EMERGENCY_WORKBOOK_SNAPSHOT_CACHE_TAG = "emergency-workbook-snapshot";

/** Same TTL rationale as the regular workbook's `SNAPSHOT_CACHE_REVALIDATE_SECONDS` -- interactive reads may reuse a recent snapshot for a short window; the notification worker's fresh-read path never goes through this cache at all (see `fetchRawEmergencyWorkbookSnapshot`'s own docs). */
const EMERGENCY_SNAPSHOT_CACHE_REVALIDATE_SECONDS = 30;

/** Same canonicalization rationale as `workbookSnapshotCache.ts`'s `canonicalizeSourceKeys` -- dedupe + sort so array order/duplicates never fragment the cache. */
function canonicalizeEmergencySourceKeys(sourceKeys: readonly EmergencySheetSourceKey[]): EmergencySheetSourceKey[] {
  return [...new Set(sourceKeys)].sort();
}

const cachedEmergencyFetch = unstable_cache(
  (sourceKeys: EmergencySheetSourceKey[]) => fetchRawEmergencyWorkbookSnapshot(sourceKeys),
  ["emergency-workbook-snapshot"],
  { revalidate: EMERGENCY_SNAPSHOT_CACHE_REVALIDATE_SECONDS, tags: [EMERGENCY_WORKBOOK_SNAPSHOT_CACHE_TAG] },
);

/** Same request-scoped in-flight de-dup rationale as `getSnapshotForCanonicalKey` in `workbookSnapshotCache.ts`. */
const getEmergencySnapshotForCanonicalKey = cache(
  (canonicalKeyString: string): Promise<RawWorkbookSnapshot> =>
    cachedEmergencyFetch(canonicalKeyString.split("+") as EmergencySheetSourceKey[]),
);

/**
 * The single entry point every emergency-mode read model uses to get the
 * raw emergency workbook snapshot -- the emergency-workbook sibling of
 * `getWorkbookSnapshot()`. Never called from any regular-mode code path,
 * so a normal (non-Emergency-Mode) request never triggers an emergency
 * Google fetch.
 */
export async function getEmergencyWorkbookSnapshot(
  sourceKeys: readonly EmergencySheetSourceKey[],
): Promise<RawWorkbookSnapshot> {
  const canonicalKeys = canonicalizeEmergencySourceKeys(sourceKeys);
  const canonicalKeyString = canonicalKeys.join("+");
  return timedStage(`emergencyWorkbook.cache(${canonicalKeyString})`, () =>
    getEmergencySnapshotForCanonicalKey(canonicalKeyString),
  );
}
