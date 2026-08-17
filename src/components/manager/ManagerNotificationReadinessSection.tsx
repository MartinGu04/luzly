import { Panel } from "@/components/ui/Panel";
import type { NotificationReadinessSummaryView } from "@/lib/presentation/notificationReadiness";

interface ManagerNotificationReadinessSectionProps {
  readiness: NotificationReadinessSummaryView | null;
}

/**
 * "מצב התראות" -- operational/data-quality context, NOT a shift conflict:
 * deliberately its OWN small section, never merged into "דורש טיפול"
 * (`ManagerAttentionSection`). Renders nothing at all when `readiness` is
 * null (`buildNotificationReadinessSummary` already returns null for both
 * "the privileged lookup was skipped/failed" and "everyone is ready" --
 * neither case gets a permanent success card here, matching spec: no noise
 * when there's nothing actionable to say).
 *
 * Collapsed by default (same native `<details>`/`<summary>` disclosure
 * `IssueRow`'s "פעולה מומלצת" already uses) -- only the compact one-line
 * summary is visible until a manager opts in to "הצג פרטים". Only names
 * ever reach the DOM -- no ids, no emails, no auth/subscription internals
 * (see `ManagerNotificationReadinessBlocker`/`NotificationReadinessBlockerGroup`).
 */
export function ManagerNotificationReadinessSection({ readiness }: ManagerNotificationReadinessSectionProps) {
  if (!readiness) return null;

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
