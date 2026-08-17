import type { ManagerNotificationReadinessBlocker, ManagerNotificationReadinessView } from "@/lib/readModels/managerTypes";

/**
 * The exact actionable-reason label for each non-`ready` status
 * (`lib/notifications/engine/readiness.ts`) -- what a manager can actually
 * DO about it, never the internal mechanism. Deliberately never mentions
 * push subscriptions/endpoints/auth accounts by their technical name.
 */
const BLOCKER_STATUS_LABEL: Record<ManagerNotificationReadinessBlocker["status"], string> = {
  missing_email: "חסר מייל בכ״א",
  ambiguous_email: "מייל משויך ליותר מאדם אחד",
  unmapped_account: "לא נמצא חשבון מערכת תואם",
  no_push_subscription: "אין מכשיר רשום להתראות",
};

/**
 * Fixed presentation order -- identity problems (no usable/unique email,
 * no matching account) before the device-level problem (no push
 * subscription yet), matching `PersonNotificationReadiness`'s own
 * precedence ladder. Never derived from data, so group order never
 * flickers between renders.
 */
const BLOCKER_STATUS_ORDER: readonly ManagerNotificationReadinessBlocker["status"][] = [
  "missing_email",
  "ambiguous_email",
  "unmapped_account",
  "no_push_subscription",
];

/** One reason group for the מצב התראות disclosure -- names only, see `ManagerNotificationReadinessBlocker`. */
export interface NotificationReadinessBlockerGroup {
  status: ManagerNotificationReadinessBlocker["status"];
  label: string;
  personNames: string[];
}

export interface NotificationReadinessSummaryView {
  /** "5 אנשים עדיין לא יכולים לקבל התראות אישיות" -- singular/plural handled, see `notificationReadinessSummaryLabel`. */
  summary: string;
  /** Only non-empty groups, in `BLOCKER_STATUS_ORDER`. Preserves each blocker's own name+id sort order from the read model -- never re-sorted here. */
  groups: NotificationReadinessBlockerGroup[];
}

/** "אדם אחד" vs "5 אנשים" -- same one/many convention `managerSummaryLabel` already uses elsewhere in this app. */
function notificationReadinessSummaryLabel(blockerCount: number): string {
  if (blockerCount === 1) return "אדם אחד עדיין לא יכול לקבל התראות אישיות";
  return `${blockerCount} אנשים עדיין לא יכולים לקבל התראות אישיות`;
}

/**
 * Builds the מצב התראות manager section's entire view from the safe
 * `ManagerNotificationReadinessView` projection -- `null` whenever there is
 * nothing to show: the lookup was skipped/failed (`view === null`, e.g. a
 * person-drilldown page, or an infra failure -- see `managerOverview.ts`)
 * OR every roster person is already `ready` (`view.blockers.length === 0`).
 * Both cases render nothing -- a permanent "everyone is ready" success card
 * would be noise (per spec), not a genuinely missing state worth flagging.
 */
export function buildNotificationReadinessSummary(
  view: ManagerNotificationReadinessView | null,
): NotificationReadinessSummaryView | null {
  if (!view || view.blockers.length === 0) return null;

  const groups: NotificationReadinessBlockerGroup[] = [];
  for (const status of BLOCKER_STATUS_ORDER) {
    const personNames = view.blockers.filter((blocker) => blocker.status === status).map((blocker) => blocker.personName);
    if (personNames.length > 0) groups.push({ status, label: BLOCKER_STATUS_LABEL[status], personNames });
  }

  return { summary: notificationReadinessSummaryLabel(view.blockers.length), groups };
}
