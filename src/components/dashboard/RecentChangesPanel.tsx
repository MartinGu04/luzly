import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { formatRecentChangeRelativeTime } from "@/lib/presentation/relativeChangeTime";
import type { RecentDashboardChange, RecentDashboardChangeCategory } from "@/lib/readModels/recentDashboardChangesTypes";

interface RecentChangesPanelProps {
  changes: RecentDashboardChange[];
  /**
   * The EXACT total number of changes since the previous visit --
   * independent of `changes.length` (the bounded, newest-first
   * presentation slice). Defaults to `changes.length` so existing
   * callers that only ever had the visible rows keep working unchanged
   * (no "ועוד N" line ever appears in that case, which is correct: there
   * is nothing more to report).
   */
  totalCount?: number;
  /** Defaults to the real current instant; tests pass a fixed value for deterministic relative-time labels. */
  now?: Date;
}

/** The SAME cue already used in the real push notification for this exact event (`lib/notifications/engine/copy.ts`) -- consistency with what the user may have already seen, never a third parallel visual language. */
const CATEGORY_EMOJI: Record<RecentDashboardChangeCategory, string> = {
  shift: "⚠️",
  team: "👥",
  duty: "🔄",
};

/** e.g. "3 שינויים מאז הביקור האחרון" / "שינוי אחד מאז הביקור האחרון". */
function formatChangeCountLabel(count: number): string {
  if (count === 1) return "שינוי אחד מאז הביקור האחרון";
  return `${count} שינויים מאז הביקור האחרון`;
}

/** e.g. "ועוד 4 שינויים" / "ועוד שינוי אחד". Only ever called when `remainingCount > 0`. */
function formatMoreChangesLabel(remainingCount: number): string {
  if (remainingCount === 1) return "ועוד שינוי אחד";
  return `ועוד ${remainingCount} שינויים`;
}

/**
 * "מה השתנה מאז הפעם הקודמת" -- a tiny, calm recap of personal
 * shift/team/duty changes SETTLED since the user's previous genuine Home
 * visit (originally PR #36's "מה השתנה", upgraded from a fixed 72-hour
 * window into a true "since last visit" recap -- see
 * `lib/readModels/recentDashboardChanges.ts`). This is NOT the
 * Notification Bell and NOT a notification inbox: read-only, no unread
 * state, no mark-as-read, no history page.
 *
 * Renders NOTHING at all when `changes` is empty -- no placeholder card,
 * no "אין שינויים", no skeleton slot. A dashboard with nothing to recap
 * must look exactly like it did before this feature existed.
 *
 * The supporting line under the heading always states the TRUE total
 * (`totalCount`), never just how many rows happen to be visible -- and a
 * quiet trailing line ("ועוד N שינויים") appears whenever `totalCount`
 * exceeds the visible rows, so a bounded V1 presentation (newest 3 rows)
 * never silently understates how much actually changed.
 *
 * `body` is the settled notification's own already-Hebrew-worded copy,
 * reused verbatim -- never regenerated here. The generic `title` (e.g.
 * "⚠️ שינוי בשיבוץ") is deliberately never rendered next to it -- it would
 * only repeat what the category emoji + body already say; it's kept
 * `sr-only` for a screen reader's benefit instead. Deliberately no
 * severity ring/red background even for a shift change -- an ordinary,
 * calm activity recap, never a warning surface.
 *
 * `body` is allowed to wrap (never `truncate`) -- unlike a title, hiding
 * part of the actual change description would defeat the panel's whole
 * purpose.
 */
export function RecentChangesPanel({ changes, totalCount = changes.length, now = new Date() }: RecentChangesPanelProps) {
  if (changes.length === 0) return null;

  const remainingCount = Math.max(0, totalCount - changes.length);

  return (
    <Panel variant="panel">
      <h3 className="text-sm font-semibold text-foreground">מה השתנה מאז הפעם הקודמת</h3>
      <p className="mt-0.5 text-xs text-muted">{formatChangeCountLabel(totalCount)}</p>
      <ul className="mt-3 space-y-1">
        {changes.map((change) => (
          <li key={change.key}>
            <Link
              href={change.href}
              className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors duration-200 hover:bg-overlay-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-sm leading-none">
                {CATEGORY_EMOJI[change.category]}
              </span>
              <span className="sr-only">{change.title}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{change.body}</p>
                <p className="mt-0.5 text-xs text-muted">{formatRecentChangeRelativeTime(change.happenedAt, now)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {remainingCount > 0 ? <p className="mt-2 text-xs text-muted">{formatMoreChangesLabel(remainingCount)}</p> : null}
    </Panel>
  );
}
