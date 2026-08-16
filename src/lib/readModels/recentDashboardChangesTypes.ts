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
