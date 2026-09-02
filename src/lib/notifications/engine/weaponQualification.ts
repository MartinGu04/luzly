import "server-only";
import type { Event } from "@/lib/domain/event";
import { detectWeaponQualificationIssues, type OperationalIssue } from "@/lib/domain/operationalIssues";
import type { Person } from "@/lib/domain/types";
import type { ShootingRangeRelevanceRecord, ShootingRangeSheetRecord } from "@/lib/parsers/shootingRanges";
import { formatCompactDate } from "@/lib/presentation/hebrewDate";
import { getCompletionsForPersonIds } from "@/lib/shootingRanges/store";
import { buildWeaponQualificationIndex } from "@/lib/readModels/shootingRangeQualification";
import { filterManagerRecipients, type RecipientResolution } from "./recipients";
import { resolveAggregateNotificationJob, upsertAggregateNotificationJob } from "./store";

/**
 * A SINGLE aggregate manager notification per OPEN EPISODE per manager --
 * never one per underlying issue (spec: production notification-spam
 * incident #1, 39 invalid guard/reserve/oxid assignments produced 39
 * separate pushes to every manager), and never one per TICK either (spec:
 * production notification-spam incident #2, a recalculated set growing
 * 38 -> 40 -> 44 produced three separate Notification Center entries and
 * three pushes for what is, to a manager, the SAME ongoing problem).
 * Aggregation is a NOTIFICATION-layer concern ONLY: `detectWeaponQualificationIssues`
 * below still returns every individual `OperationalIssue`, completely
 * undeduplicated -- Manager Area's "דורש טיפול" (`buildManagerOverviewReadModel.ts`,
 * a SEPARATE call to the same function) is never touched by anything in
 * this file and stays fully granular.
 */
const CATEGORY_WEAPON_QUALIFICATION_SUMMARY = "weapon_qualification_summary";
/** Lands on Manager Area's own "דורש טיפול" section -- the SAME issues this notification is summarizing, never a shooting-ranges-feature-specific page. */
const MANAGER_PATH = "/manager";

export interface WeaponQualificationCheckResult {
  issuesDetected: number;
  jobsCreated: number;
}

/**
 * One stable identity per underlying weapon-qualification PROBLEM --
 * (person, activity date, duty family) -- independent of which manager is
 * being notified, and independent of `issues` array order. This is the
 * unit the aggregate content (`sourceRef` below) is built from: "which
 * individual problems does the CURRENT episode's displayed count cover".
 * `null` only in the structurally-unreachable case of a
 * `weapon_qualification_invalid` issue with no `targetEvent`/`dutyFamily`
 * (`detectWeaponQualificationIssues` itself never produces one without
 * both).
 */
function issueKey(issue: OperationalIssue): string | null {
  const dutyFamily = issue.targetEvent?.dutyFamily ?? null;
  if (!dutyFamily) return null;
  return `${issue.personId}:${issue.date}:${dutyFamily}`;
}

/**
 * The STABLE per-manager identity of this alert's whole logical episode --
 * deliberately NEVER derived from the current issue content (that was
 * incident #2's own root cause, see this file's top-of-file docstring and
 * the migration `upsertAggregateNotificationJob` goes through). Conceptually
 * one fixed key per logical issue TYPE (`manager:shooting-range-qualification-mismatch`,
 * as the spec names it) -- kept per-recipient here, matching every other
 * dedupe key in this codebase (see `scheduleManagerConfirmationRequiredJob`'s
 * own docs in `shootingRanges.ts` for the documented Production incident a
 * dedupe key SHARED across recipients already caused here once: only the
 * LAST manager in a `Promise.all`/loop would ever get a row).
 */
function aggregateDedupeKey(managerUserId: string): string {
  return `${CATEGORY_WEAPON_QUALIFICATION_SUMMARY}:${managerUserId}`;
}

function assignmentCountLabel(count: number): string {
  return count === 1 ? "שיבוץ עתידי אחד" : `${count} שיבוצים עתידיים`;
}

function affectedPeopleLabel(count: number): string {
  return count === 1 ? "אצל אדם אחד" : `אצל ${count} אנשים`;
}

/**
 * The notification worker's own weapon-qualification check (spec: a
 * GENERAL rule over every שמירה/עתודה/אוקסיד activity, never an
 * oxid-specific patch, and driven by the ACTIVITY's own requirement alone
 * -- never by a person's service category or shift-capable role, see
 * `buildWeaponQualificationIndex`'s own docs) -- reuses the EXACT SAME
 * `detectWeaponQualificationIssues` "דורש טיפול" already reads for Manager
 * Area, fed from the EXACT SAME `buildWeaponQualificationIndex` the
 * manager overview loader uses (never a second/competing qualification
 * computation). `sheetRecords`/`relevanceRecords` are already parsed by
 * THIS tick's own `freshRead.ts` -- never re-fetched/re-parsed here.
 *
 * `events` here is the FULL parsed schedule -- `parseScheduleSheet` never
 * filters by date, so it still carries every historical assignment. Manager
 * Area's own "דורש טיפול" is fine seeing those (its own range filter,
 * `buildManagerOverviewReadModel`'s own concern, decides what's currently
 * visible) -- but a fresh production tick must never mine that full history
 * and fire a notification for a long-past guard/reserve/oxid assignment
 * whose qualification happened to be invalid back then. So, for
 * NOTIFICATION purposes only, `events` is narrowed to `date >= today`
 * before `detectWeaponQualificationIssues` ever sees it -- historical
 * detection stays fully available to the domain layer/Manager Area, this
 * narrowing is local to this worker-facing wrapper.
 *
 * `persist: false` (dry-run) still runs detection (a real, read-only
 * Supabase completions query -- cheap, and needed for an honest
 * `issuesDetected` count) but never creates or touches a job, mirroring
 * every other dry-run phase in this pipeline (spec section 24: "SEND NO
 * PUSH").
 *
 * AGGREGATION + EPISODE DEDUPE (spec: fix production notification spam
 * without a new persisted subsystem -- reuses the existing
 * `notification_jobs` outbox via `upsertAggregateNotificationJob`/
 * `resolveAggregateNotificationJob`, see those functions' own docs and
 * this file's migration for the exact mechanics): every currently-open
 * issue is collapsed into ONE (person, date, dutyFamily) key per real
 * problem, and each manager has AT MOST one ROW, EVER, for this whole
 * logical alert -- `aggregateDedupeKey(manager.userId)`, stable for the
 * alert's entire lifetime, never re-derived from the current content
 * (that was this exact spam bug's own root cause: a content-hash-based
 * key meant a genuinely new problem appearing while OLDER ones were
 * still open -- 38 growing to 40 -- hashed to a different key and
 * inserted a brand-new row/push, instead of updating the one already
 * open).
 *
 *  - `currentKeys` non-empty -> every manager gets an
 *    `upsertAggregateNotificationJob` call EVERY eligible tick,
 *    unconditionally (the same "recompute and re-upsert on every tick,
 *    by design" convention `upsertPendingReminderJob` already
 *    establishes for reminders) with the CURRENT full count/body. If no
 *    episode is open yet (first appearance, or a prior episode was
 *    resolved), this opens a fresh one: the row is `pending`, so the
 *    worker's next delivery tick pushes it exactly once. If an episode
 *    is already open, this only refreshes the row's displayed title/body
 *    in place -- no new row, no re-push, whether the count grew,
 *    shrank, or is unchanged.
 *  - `currentKeys` empty -> the issue is fully resolved. Every manager's
 *    open episode (if any) is closed via `resolveAggregateNotificationJob`,
 *    so a LATER genuinely new problem is treated as a fresh episode (a
 *    new push), never silently folded into the old, now-irrelevant one.
 *
 * This decision is made INDEPENDENTLY per manager (each has their own
 * dedupe key/row), so a manager added after an episode was already
 * opened for everyone else still gets caught up on their own next
 * eligible tick, and never shares a dedupe key with another recipient
 * (the documented past-incident class this codebase already guards
 * against everywhere else, see `shootingRanges.ts`'s own docs).
 * Concurrency across repeated/overlapping worker ticks is guaranteed by
 * the underlying RPC's own row locking, never by anything in this
 * function -- see `upsertAggregateNotificationJob`'s docstring.
 */
export async function runWeaponQualificationCheck(
  people: readonly Person[],
  events: readonly Event[],
  sheetRecords: readonly ShootingRangeSheetRecord[],
  relevanceRecords: readonly ShootingRangeRelevanceRecord[],
  today: string,
  persist: boolean,
  recipientResolution: RecipientResolution,
): Promise<WeaponQualificationCheckResult> {
  // The FULL roster, never pre-filtered by `isEligibleForShootingRanges` --
  // see `buildWeaponQualificationIndex`'s own docs: this alert is
  // activity-driven, not scoped to the מטווחים UI's own eligibility rule.
  const personIds = people.map((person) => person.id);
  const completions = await getCompletionsForPersonIds(personIds);
  const qualificationByPersonId = buildWeaponQualificationIndex({
    people,
    sheetRecords,
    relevanceRecords,
    completions,
    today,
  });

  // NOTIFICATION-only narrowing -- see this function's own docstring. A
  // historical assignment (`event.date < today`) never reaches detection
  // here, however invalid the qualification was back then; today's own
  // date is still included (an activity happening today is very much a
  // live, actionable problem).
  const upcomingEvents = events.filter((event) => event.date >= today);

  // The FULL, undeduplicated issue list -- exactly what "דורש טיפול" would
  // see for this same input (never collapsed/altered here). Aggregation
  // below only affects what gets WRITTEN to `notification_jobs`.
  const issues = detectWeaponQualificationIssues(upcomingEvents, qualificationByPersonId);
  if (!persist) return { issuesDetected: issues.length, jobsCreated: 0 };

  const managers = filterManagerRecipients(people, recipientResolution);
  if (managers.length === 0) return { issuesDetected: issues.length, jobsCreated: 0 };

  const currentKeys = new Set<string>();
  for (const issue of issues) {
    const key = issueKey(issue);
    if (key) currentKeys.add(key);
  }

  if (currentKeys.size === 0) {
    // Fully resolved (or never had an open episode to begin with) --
    // close out every manager's open episode, if any, so a LATER
    // genuinely new problem starts a fresh one instead of being folded
    // into stale, already-irrelevant content.
    for (const manager of managers) {
      await resolveAggregateNotificationJob(aggregateDedupeKey(manager.userId));
    }
    return { issuesDetected: issues.length, jobsCreated: 0 };
  }

  const sortedKeys = [...currentKeys].sort();
  const affectedPersonCount = new Set(issues.map((issue) => issue.personId)).size;
  const earliestDate = issues.reduce((min, issue) => (issue.date < min ? issue.date : min), issues[0].date);
  const dateLabel = formatCompactDate(earliestDate) ?? earliestDate;

  const title = "⚠️ בעיות כשירות מטווחים";
  const body = `נמצאו ${assignmentCountLabel(sortedKeys.length)} ללא כשירות מטווחים בתוקף ${affectedPeopleLabel(affectedPersonCount)}. האירוע הקרוב: ${dateLabel}. נדרש טיפול.`;
  const sourceRef = JSON.stringify(sortedKeys);
  const now = new Date().toISOString();

  let jobsCreated = 0;
  for (const manager of managers) {
    const reopened = await upsertAggregateNotificationJob({
      category: CATEGORY_WEAPON_QUALIFICATION_SUMMARY,
      recipientUserId: manager.userId,
      title,
      body,
      path: MANAGER_PATH,
      dedupeKey: aggregateDedupeKey(manager.userId),
      scheduledFor: now,
      sourceRef,
    });
    if (reopened) jobsCreated++;
  }

  return { issuesDetected: issues.length, jobsCreated };
}
