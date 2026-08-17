import type {
  ManagerNotificationReadinessBlocker,
  ManagerNotificationReadinessState,
} from "@/lib/readModels/managerTypes";

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

/**
 * What `ManagerNotificationReadinessSection` renders -- three DISTINCT
 * outcomes, never collapsed into a boolean/null:
 * - `hidden` -- nothing worth showing: either the lookup was skipped (a
 *   person is selected) or it succeeded and everyone is already ready. Both
 *   are genuinely calm states, not an unknown.
 * - `unavailable` -- the lookup was attempted and failed; the manager sees
 *   a small neutral notice instead of a silently missing section (never
 *   conflated with "everyone is ready").
 * - `blockers` -- the lookup succeeded and at least one person isn't ready.
 */
export type NotificationReadinessSectionView =
  | { kind: "hidden" }
  | { kind: "unavailable" }
  | { kind: "blockers"; summary: string; groups: NotificationReadinessBlockerGroup[] };

/** "אדם אחד" vs "5 אנשים" -- same one/many convention `managerSummaryLabel` already uses elsewhere in this app. */
function notificationReadinessSummaryLabel(blockerCount: number): string {
  if (blockerCount === 1) return "אדם אחד עדיין לא יכול לקבל התראות אישיות";
  return `${blockerCount} אנשים עדיין לא יכולים לקבל התראות אישיות`;
}

/**
 * Builds the מצב התראות manager section's entire view from the read
 * model's own three-state `ManagerNotificationReadinessState` -- `skipped`
 * and an all-ready `available` both render nothing (a permanent success
 * card would be noise, per spec); `unavailable` renders the neutral
 * "can't check right now" notice; a non-empty `available` renders the
 * compact summary + grouped blockers.
 */
export function buildNotificationReadinessSummary(
  state: ManagerNotificationReadinessState,
): NotificationReadinessSectionView {
  if (state.status === "skipped") return { kind: "hidden" };
  if (state.status === "unavailable") return { kind: "unavailable" };
  if (state.view.blockers.length === 0) return { kind: "hidden" };

  const groups: NotificationReadinessBlockerGroup[] = [];
  for (const status of BLOCKER_STATUS_ORDER) {
    const personNames = state.view.blockers
      .filter((blocker) => blocker.status === status)
      .map((blocker) => blocker.personName);
    if (personNames.length > 0) groups.push({ status, label: BLOCKER_STATUS_LABEL[status], personNames });
  }

  return { kind: "blockers", summary: notificationReadinessSummaryLabel(state.view.blockers.length), groups };
}
