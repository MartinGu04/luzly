import "server-only";
import type { Person } from "@/lib/domain/types";
import { dayOfWeek, parseCalendarDate } from "@/lib/domain/dutyBlocks";
import type { LocalNow } from "@/lib/domain/localNow";
import { fetchAllSubscribedUserIds, fetchAllUserIdsByEmail, resolvePersonIdentity, type AuthAccountLookup } from "./recipients";
import type { CustomWeeklyRuleConfig } from "./ruleConfig";
import {
  insertManagerNotificationBatchIfAbsent,
  insertNotificationJobIfAbsent,
  listExistingManagerNotificationBatchIdempotencyKeys,
} from "./store";

/**
 * Manager-created weekly recurring notifications ("📌 תזכורת לאילוצים
 * every Saturday 21:00", ...) -- V1 custom rules (`notification_rules.kind
 * = 'custom_weekly'`). Dispatched by the SAME once-a-minute worker that
 * already dispatches one-time scheduled broadcasts (`scheduledWorker.ts`),
 * never a second cron, and through the EXACT SAME manager broadcast/batch/
 * job pipeline `manualBroadcast.ts`/`scheduledBroadcast.ts` already use --
 * this module adds occurrence RESOLUTION only, never a second Push sender.
 *
 * Occurrence identity for one weekday/week is `recurring:<ruleId>:<localDate>`
 * -- the SAME string used as BOTH `manager_notification_batches.idempotency_key`
 * AND (via that batch's own id) `notification_jobs.dedupe_key`'s prefix, so
 * at-most-once dispatch is enforced at the database level twice over:
 * the batch's unique `idempotency_key` constraint (only one of two
 * concurrent workers can ever INSERT the same key; the other reads back
 * the already-created row) and each job's unique `dedupe_key` constraint
 * (even if both workers proceed to job creation against the same
 * already-existing batch, a duplicate `recurring:<batchId>:<userId>`
 * insert is a harmless no-op). No separate "occurrence" table needed --
 * see the migration's own doc comment for why this was the right call
 * over inventing one.
 *
 * Editing a rule's time/title/body before its occurrence fires simply
 * changes what the NEXT due-check sees (there is no pre-materialized job
 * the way system reminders have) -- nothing to reconcile. Editing AFTER
 * an occurrence already dispatched cannot resend it: the idempotency key
 * is per calendar date, so `findDueCustomWeeklyOccurrences` never even
 * considers an already-dispatched occurrence again, regardless of what
 * changed on the rule since.
 */

function recurringOccurrenceIdempotencyKey(ruleId: string, occurrenceDate: string): string {
  return `recurring:${ruleId}:${occurrenceDate}`;
}

/** The stable category every recurring-rule occurrence's `notification_jobs` row carries -- reuses the existing worker/inbox/Push pipeline, deliberately DISTINCT from `manager_broadcast` (immediate/scheduled sends) so the two remain independently identifiable, and deliberately excluded from the "נשלחו לאחרונה" recent-broadcasts list (see `store.ts`'s `listRecentManagerNotificationBatches`). */
export const RECURRING_BROADCAST_CATEGORY = "manager_recurring_broadcast";

export interface DueCustomWeeklyOccurrence {
  rule: CustomWeeklyRuleConfig;
  /** Asia/Jerusalem local calendar date this occurrence belongs to -- always `now.date` (an occurrence is only ever considered on its own weekday). */
  occurrenceDate: string;
  idempotencyKey: string;
}

/**
 * Which of `rules` have a due, not-yet-dispatched occurrence as of `now`
 * -- enabled, today's Asia/Jerusalem weekday matches the rule's
 * configured weekday, and the configured local time has passed. Purely a
 * cheap, READ-ONLY Supabase check (one bulk `.in()` lookup against
 * already-created batches, mirroring `peekAnyManagerScheduledBroadcastWorkDue`'s
 * own "cheap pre-check, no Google read" shape) -- never claims/mutates,
 * safe to call every worker tick even when nothing is due.
 */
export async function findDueCustomWeeklyOccurrences(
  rules: readonly CustomWeeklyRuleConfig[],
  now: LocalNow,
): Promise<DueCustomWeeklyOccurrence[]> {
  const today = parseCalendarDate(now.date);
  if (!today) return [];
  const todayWeekday = dayOfWeek(today);

  const candidates: DueCustomWeeklyOccurrence[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.weekday !== todayWeekday) continue;
    const dueMinuteOfDay = rule.localHour * 60 + rule.localMinute;
    if (now.minuteOfDay < dueMinuteOfDay) continue;
    candidates.push({
      rule,
      occurrenceDate: now.date,
      idempotencyKey: recurringOccurrenceIdempotencyKey(rule.id, now.date),
    });
  }
  if (candidates.length === 0) return [];

  const alreadyDispatched = await listExistingManagerNotificationBatchIdempotencyKeys(
    candidates.map((candidate) => candidate.idempotencyKey),
  );
  return candidates.filter((candidate) => !alreadyDispatched.has(candidate.idempotencyKey));
}

interface RecurringDispatchResolution {
  pushCapable: { personId: string; userId: string }[];
  inboxOnly: { personId: string; userId: string }[];
  candidateCount: number;
}

/**
 * DISPATCH-time audience resolution -- deliberately NOT `manualBroadcast.ts`'s
 * `resolveAudience` (a fresh manager compose request's fail-closed "any
 * unknown id fails the WHOLE request" rule). A recurring rule is
 * long-lived, so:
 *
 *  - `"everyone"` is resolved against the CURRENT roster on every single
 *    occurrence, never frozen at rule-creation time (unlike a one-time
 *    scheduled broadcast's snapshot -- spec: "do not copy one-time
 *    snapshot semantics blindly").
 *  - `"person"`/`"people"` re-validates the rule's OWN stored
 *    `targetPersonIds` against the current roster + current auth mapping
 *    on every occurrence. A person no longer in the roster, or not
 *    (yet/anymore) auth-mapped, is skipped TRUTHFULLY for that one
 *    occurrence -- never a reason to fail the whole send, and never a
 *    door for a client-supplied id to sneak in (this only ever reads the
 *    rule's own server-validated stored ids, never anything request-
 *    scoped).
 */
function resolveRecurringDispatchTargets(
  rule: CustomWeeklyRuleConfig,
  people: readonly Person[],
  emailToAccount: ReadonlyMap<string, AuthAccountLookup>,
  subscribed: ReadonlySet<string>,
): RecurringDispatchResolution {
  const candidatePersonIds = rule.audienceKind === "everyone" ? people.map((person) => person.id) : rule.targetPersonIds;
  const byId = new Map(people.map((person) => [person.id, person]));

  const pushCapable: { personId: string; userId: string }[] = [];
  const inboxOnly: { personId: string; userId: string }[] = [];

  for (const personId of candidatePersonIds) {
    const person = byId.get(personId);
    if (!person) continue; // no longer in the roster -- skipped truthfully, never fails the occurrence

    const identity = resolvePersonIdentity(person, people, emailToAccount);
    if (identity.status !== "mapped") continue;

    if (subscribed.has(identity.userId)) pushCapable.push({ personId: person.id, userId: identity.userId });
    else inboxOnly.push({ personId: person.id, userId: identity.userId });
  }

  return { pushCapable, inboxOnly, candidateCount: candidatePersonIds.length };
}

async function dispatchOneOccurrence(
  occurrence: DueCustomWeeklyOccurrence,
  people: readonly Person[],
  emailToAccount: ReadonlyMap<string, AuthAccountLookup>,
  subscribed: ReadonlySet<string>,
): Promise<void> {
  const { rule, idempotencyKey } = occurrence;
  const resolution = resolveRecurringDispatchTargets(rule, people, emailToAccount, subscribed);
  const freshRecipientUserIds = [
    ...new Set([...resolution.pushCapable, ...resolution.inboxOnly].map((recipient) => recipient.userId)),
  ].sort();

  const { row: batch, created } = await insertManagerNotificationBatchIfAbsent({
    idempotencyKey,
    createdByPersonId: rule.createdByPersonId ?? "system",
    createdByPersonName: rule.createdByPersonName ?? "התראה מחזורית",
    audienceKind: rule.audienceKind,
    targetPersonIds: rule.targetPersonIds,
    resolvedRecipientUserIds: freshRecipientUserIds,
    title: rule.title,
    body: rule.body,
    resolvedRecipientCount: freshRecipientUserIds.length,
    pushCapableCount: resolution.pushCapable.length,
    inboxOnlyCount: resolution.inboxOnly.length,
    unresolvedCount: Math.max(0, resolution.candidateCount - freshRecipientUserIds.length),
  });

  // `created` false means some other invocation (a concurrent worker tick,
  // or a retry of this same tick after a partial crash) already won the
  // insert -- reuse ITS frozen recipient set/copy for job creation, never
  // re-resolve. No replay/conflict check needed here (unlike a manager-
  // typed compose request): `idempotencyKey` already uniquely identifies
  // exactly ONE logical occurrence, so any existing row under this key IS
  // this occurrence by construction.
  const jobRecipientUserIds = created ? freshRecipientUserIds : batch.resolvedRecipientUserIds;
  const title = created ? rule.title : batch.title;
  const body = created ? rule.body : batch.body;
  const scheduledFor = new Date().toISOString();

  await Promise.all(
    jobRecipientUserIds.map((recipientUserId) =>
      insertNotificationJobIfAbsent({
        category: RECURRING_BROADCAST_CATEGORY,
        recipientUserId,
        title,
        body,
        path: "/",
        dedupeKey: `recurring:${batch.id}:${recipientUserId}`,
        scheduledFor,
        sourceRef: `recurring:${batch.id}`,
      }),
    ),
  );
}

export interface RecurringRuleDispatchSummary {
  dispatched: number;
  failed: number;
}

/**
 * Dispatches every already-`findDueCustomWeeklyOccurrences`-filtered
 * occurrence, with `people` the caller's OWN already-fetched fresh
 * personnel read (never a second Google/workbook read here). One failed
 * occurrence never blocks the rest -- each is independently caught and
 * counted, so a bug/transient error in one rule's dispatch can't stall
 * every other due occurrence this tick.
 */
export async function runDueCustomWeeklyRuleDispatch(
  due: readonly DueCustomWeeklyOccurrence[],
  people: readonly Person[],
): Promise<RecurringRuleDispatchSummary> {
  if (due.length === 0) return { dispatched: 0, failed: 0 };

  const [emailToAccount, subscribedUserIds] = await Promise.all([fetchAllUserIdsByEmail(), fetchAllSubscribedUserIds()]);
  const subscribed = new Set(subscribedUserIds);

  let dispatched = 0;
  let failed = 0;
  for (const occurrence of due) {
    try {
      await dispatchOneOccurrence(occurrence, people, emailToAccount, subscribed);
      dispatched++;
    } catch (error) {
      failed++;
      console.error(
        `[notifications] recurring rule dispatch failed rule=${occurrence.rule.id} date=${occurrence.occurrenceDate}`,
        error instanceof Error ? error.message : "unknown_error",
      );
    }
  }

  return { dispatched, failed };
}
