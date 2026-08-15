import "server-only";
import { unstable_cache } from "next/cache";
import { fetchRawWorkbookSnapshot, type RawWorkbookSnapshot, type SheetSourceKey } from "@/lib/google";
import { timedStage } from "@/lib/config/timingDiagnostics";

/**
 * Cache tag for the short-lived workbook-snapshot cache below. Exported so
 * `./actions.ts`'s explicit-refresh Server Action can invalidate exactly
 * this, and nothing else.
 */
export const WORKBOOK_SNAPSHOT_CACHE_TAG = "workbook-snapshot";

/**
 * How long a fetched snapshot stays reusable across requests, in seconds.
 *
 * Deliberately "tens of seconds, not many minutes" -- this app is a live
 * operational schedule (Google Sheets is the source of truth; מי-מה-מו is
 * read-only), so staleness must stay short. 30s is chosen specifically to:
 *  - comfortably absorb a normal burst of in-app navigation (tapping
 *    through several routes over a few seconds) with ZERO extra Google
 *    round trips, which is exactly the repeated-fetch problem this exists
 *    to remove;
 *  - stay well inside the "עודכן עכשיו" ("just now") freshness bucket the
 *    UI already shows for up to 59s (`formatDataFreshnessLabel`), so a
 *    cache hit never contradicts what the freshness label says;
 *  - never be mistaken for anything close to "static" content -- a user
 *    who stays on the same page for half a minute and then navigates again
 *    will trigger a genuinely fresh Google read.
 */
const SNAPSHOT_CACHE_REVALIDATE_SECONDS = 30;

/**
 * Canonical, deterministic cache-key representation for a set of source
 * keys -- de-duplicated and SORTED, so the exact same logical source set
 * requested in a different array order (or with accidental duplicates)
 * always maps to the SAME cache entry, never a spurious extra one. This is
 * also the array actually passed to `fetchRawWorkbookSnapshot`, so the
 * cached snapshot's own `sheets` order matches what was canonicalized
 * (harmless either way -- every caller looks sheets up by name, never by
 * position, except the single-source `["personnel"]` case where order is
 * moot).
 */
function canonicalizeSourceKeys(sourceKeys: readonly SheetSourceKey[]): SheetSourceKey[] {
  return [...new Set(sourceKeys)].sort();
}

/**
 * The actual `unstable_cache`-wrapped fetch. Takes only the already-
 * canonicalized source keys as its argument, which `unstable_cache` folds
 * into its own cache key alongside the fixed `keyParts` below -- so a
 * request for `["schedule","settings"]` and one for
 * `["settings","schedule"]` are guaranteed to hit the exact same entry
 * (see `canonicalizeSourceKeys`), while a manager's broader 5-source
 * request and a normal user's 3-source request -- genuinely different
 * logical sets -- are guaranteed NOT to collide.
 *
 * Depends on nothing request-scoped (`cookies`/`headers`/the authenticated
 * identity never reach this function) -- the raw workbook snapshot is the
 * same shared, non-personal operational data for every viewer, which is
 * exactly the kind of thing `unstable_cache` (Next's cross-request Data
 * Cache) is safe to hold. This is NEVER a cache of any authenticated
 * user's session, identity, authorization decision, or personalized
 * read-model output -- those are all computed fresh, every request, from
 * whatever snapshot (cached or not) this returns.
 */
const cachedFetch = unstable_cache(
  (sourceKeys: SheetSourceKey[]) => fetchRawWorkbookSnapshot(sourceKeys),
  ["workbook-snapshot"],
  { revalidate: SNAPSHOT_CACHE_REVALIDATE_SECONDS, tags: [WORKBOOK_SNAPSHOT_CACHE_TAG] },
);

/**
 * The single entry point every read-model loader uses to get the raw
 * workbook snapshot -- reuses a recent snapshot for the same canonical
 * source set (see `SNAPSHOT_CACHE_REVALIDATE_SECONDS`) instead of always
 * performing a live Google `batchGet`. `fetchedAt` on a cache hit is
 * whatever the ORIGINAL fetch recorded -- never "now" -- so the UI's
 * freshness label always reflects when Google was actually last read, not
 * when this particular route happened to render (see
 * `fetchRawWorkbookSnapshot`, which stamps `fetchedAt` once, inside the
 * cached function, before any caching wrapper touches the result).
 *
 * `unstable_cache` itself provides the cross-request reuse AND the
 * in-flight de-duplication for concurrent callers requesting the same
 * canonical key (Next's own Incremental Cache, not a hand-rolled lock) --
 * this module never introduces its own module-level mutable cache.
 */
export async function getWorkbookSnapshot(
  sourceKeys: readonly SheetSourceKey[],
): Promise<RawWorkbookSnapshot> {
  const canonicalKeys = canonicalizeSourceKeys(sourceKeys);
  return timedStage(`workbook.cache(${canonicalKeys.join("+")})`, () => cachedFetch(canonicalKeys));
}
