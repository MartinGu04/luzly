export type RecentDashboardChangeCategory = "shift" | "team" | "duty";

/**
 * One recently SETTLED personal semantic change, safe to render directly
 * -- see `recentDashboardChanges.ts` for how this is built from the
 * notification engine's own durable outbox (`notification_jobs`), never a
 * second workbook-diff system. Never carries `recipient_user_id`,
 * `dedupe_key`, a raw `source_ref`, `attempts`, `last_error`, or any other
 * internal notification-engine field.
 */
export interface RecentDashboardChange {
  key: string;
  category: RecentDashboardChangeCategory;
  /** The settled notification's own short title (e.g. "⚠️ שינוי בשיבוץ") -- kept for context/accessibility, deliberately NOT rendered verbatim next to `body` by `RecentChangesPanel` (redundant with the category cue). */
  title: string;
  /** The settled notification's own already-Hebrew-worded description -- the dominant, reused text. */
  body: string;
  /** ISO instant the change settled (the job's `created_at`) -- relative-time display only, never shown as a raw timestamp. */
  happenedAt: string;
  /** Always a safe, known in-app destination -- never an arbitrary/raw path. */
  href: string;
  /** The affected YYYY-MM-DD, only when safely derivable from the settled change's own fact key -- null when absent/unparseable (in which case `href` already falls back to the category's canonical destination). */
  date: string | null;
}

/**
 * The personal Home dashboard's "מה השתנה מאז הפעם הקודמת" recap -- a
 * true "since your previous Home visit" snapshot (see
 * `recentDashboardChanges.ts`'s own docstring for the full upgrade from
 * PR #36's fixed 72-hour horizon). Always returned, even when the
 * underlying visit-state/notification-jobs read fails or this is the
 * user's first-ever visit -- in both cases `items`/`totalCount` simply
 * degrade to empty, which `RecentChangesPanel` already renders as
 * nothing at all.
 */
export interface DashboardVisitRecap {
  /**
   * The server-generated snapshot instant this visit's recap was
   * computed at -- captured BEFORE the previous-visit read/query even
   * runs, so it is always populated (never affected by a downstream
   * failure). This is the exact cutoff `DashboardVisitMarker` persists
   * after the Home screen mounts -- never the later instant the client
   * effect actually runs at, which would risk losing a change that
   * settles in the gap between this server read and that client write
   * (see the marker's own docstring).
   */
  visitStartedAt: string;
  /** Newest-first, bounded presentation slice -- never the full match set. */
  items: RecentDashboardChange[];
  /** The EXACT total number of relevant changes since the previous visit, independent of how many `items` are shown. */
  totalCount: number;
}
