"use server";

import { revalidateTag } from "next/cache";
import { WORKBOOK_SNAPSHOT_CACHE_TAG } from "./workbookSnapshotCache";
import { EMERGENCY_WORKBOOK_SNAPSHOT_CACHE_TAG } from "./emergencyWorkbookSnapshotCache";

/**
 * The manual "רענון נתונים" refresh control's real forced-refresh step.
 *
 * `revalidateTag(tag, { expire: 0 })` -- NOT the one-argument legacy form
 * (removed in this Next.js version's types) and NOT `revalidateTag(tag,
 * "max")` (stale-while-revalidate: the tag is marked stale but a cache HIT
 * can still be served immediately afterward, with fresh data only fetched
 * in the background for a LATER request -- wrong for a control whose
 * entire point is "get me fresh data right now"). `{ expire: 0 }` is
 * Next's own documented mechanism for genuinely immediate expiration: the
 * cache entry is gone before this action returns, so the very next
 * `getWorkbookSnapshot()` call -- triggered by the client's `router
 * .refresh()` right after this resolves -- is guaranteed to be a cache
 * miss and perform a real Google `batchGet`, producing a new `fetchedAt`.
 *
 * Also expires the EMERGENCY workbook's own snapshot tag in the same
 * call -- one manual "רענון נתונים" control refreshes both workbooks'
 * cached snapshots, since a manager has no way to know (or need to care)
 * which one is currently authoritative. This never triggers an
 * unnecessary emergency Google fetch on its own: expiring a tag that has
 * no cached entries (the common case while Emergency Mode has never been
 * activated) is a no-op, and the next actual READ of emergency data is
 * still the only thing that performs a real fetch.
 *
 * Ordering matters: `DataFreshnessStatus` awaits this action to completion
 * BEFORE calling `router.refresh()`, never the reverse and never in
 * parallel -- otherwise the refresh request could race ahead of the
 * invalidation and still observe the stale cache entry.
 */
export async function refreshWorkbookSnapshotAction(): Promise<void> {
  revalidateTag(WORKBOOK_SNAPSHOT_CACHE_TAG, { expire: 0 });
  revalidateTag(EMERGENCY_WORKBOOK_SNAPSHOT_CACHE_TAG, { expire: 0 });
}
