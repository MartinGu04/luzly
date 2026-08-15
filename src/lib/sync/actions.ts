"use server";

import { revalidateTag } from "next/cache";
import { WORKBOOK_SNAPSHOT_CACHE_TAG } from "./workbookSnapshotCache";

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
 * Ordering matters: `DataFreshnessStatus` awaits this action to completion
 * BEFORE calling `router.refresh()`, never the reverse and never in
 * parallel -- otherwise the refresh request could race ahead of the
 * invalidation and still observe the stale cache entry.
 */
export async function refreshWorkbookSnapshotAction(): Promise<void> {
  revalidateTag(WORKBOOK_SNAPSHOT_CACHE_TAG, { expire: 0 });
}
