# lib/sync

Orchestrates refreshing data (google -> parsers -> domain), tracks
sync/update status, and owns the workbook-snapshot cache. Read-only:
never writes back to Google Sheets.

- `workbookSnapshotCache.ts` — `getWorkbookSnapshot(sourceKeys)`, the ONE
  entry point every read-model loader uses to get the raw workbook
  snapshot. Wraps `lib/google`'s `fetchRawWorkbookSnapshot` in a short-TTL
  (`SNAPSHOT_CACHE_REVALIDATE_SECONDS`, currently 30s) `unstable_cache`,
  keyed by a canonicalized (de-duplicated, sorted) source-key set — so the
  same logical source set in a different array order always hits the same
  cache entry, and a manager's broader source set never collides with a
  normal user's narrower one. Caches ONLY the shared, non-personal raw
  snapshot — never an authenticated session, an authorization decision, or
  any user-specific/personalized read-model output; those are all computed
  fresh, every request, from whatever snapshot this returns.
- `emergencyWorkbookSnapshotCache.ts` — `getEmergencyWorkbookSnapshot(sourceKeys)`,
  the EMERGENCY workbook's own entry point, same shape as
  `workbookSnapshotCache.ts` but a fully separate `unstable_cache`
  instance (its own fixed key `["emergency-workbook-snapshot"]`, its own
  tag) so the two workbooks' snapshots can never collide even if a
  future source-key string ever coincided textually. Never invoked from
  any regular-mode code path, so Emergency Mode being off means the
  emergency spreadsheet is never fetched.
- `actions.ts` — `refreshWorkbookSnapshotAction()`, a Server Action the
  manual "רענון נתונים" control calls to force a genuinely fresh Google
  read (`revalidateTag(..., { expire: 0 })` — immediate expiration, not
  stale-while-revalidate) before `router.refresh()`. Expires BOTH the
  regular and the emergency snapshot tags — one manual refresh keeps
  whichever workbook is currently authoritative fresh, and expiring an
  empty/never-populated emergency tag is a harmless no-op.

No module-level mutable cache object of its own anywhere in this
directory — all caching goes through Next's own `unstable_cache`/
`revalidateTag`, which also provides in-flight de-duplication for
concurrent requests to the same cache key.
