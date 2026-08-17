import { Panel } from "@/components/ui/Panel";
import type { NotificationReadinessSectionView } from "@/lib/presentation/notificationReadiness";

interface ManagerNotificationReadinessSectionProps {
  readiness: NotificationReadinessSectionView;
}

/**
 * "מצב התראות" -- operational/data-quality context, NOT a shift conflict:
 * deliberately its OWN small section, never merged into "דורש טיפול"
 * (`ManagerAttentionSection`). Three distinct renders, matching
 * `NotificationReadinessSectionView.kind` exactly:
 * - `hidden` -- nothing at all (lookup skipped, or everyone is ready --
 *   neither gets a permanent success card, per spec).
 * - `unavailable` -- a small neutral notice. Deliberately NOT the same as
 *   `hidden`: an infra failure must never look identical to "everyone is
 *   ready" to a manager reading this page. No raw error, no technical
 *   detail, no names, no "דורש טיפול" severity styling -- this is a plain
 *   muted status line, not an alarm.
 * - `blockers` -- the compact summary + collapsed `הצג פרטים` disclosure,
 *   same native `<details>`/`<summary>` pattern `IssueRow`'s "פעולה
 *   מומלצת" already uses. Only names ever reach the DOM -- no ids, no
 *   emails, no auth/subscription internals.
 */
export function ManagerNotificationReadinessSection({ readiness }: ManagerNotificationReadinessSectionProps) {
  if (readiness.kind === "hidden") return null;

  if (readiness.kind === "unavailable") {
    return (
      <Panel variant="compact">
        <p className="text-sm text-muted">לא ניתן לבדוק כרגע את מצב ההתראות</p>
      </Panel>
    );
  }

  return (
    <Panel variant="compact">
      <p className="text-sm font-medium text-foreground">{readiness.summary}</p>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer font-medium text-muted-2">הצג פרטים</summary>
        <div className="mt-2 space-y-2">
          {readiness.groups.map((group) => (
            <div key={group.status}>
              <p className="font-medium text-muted-2">{group.label}</p>
              <p className="mt-0.5 text-muted">{group.personNames.join(" · ")}</p>
            </div>
          ))}
        </div>
      </details>
    </Panel>
  );
}
