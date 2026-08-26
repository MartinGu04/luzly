import "server-only";
import { formatCalendarDate, subtractCalendarDays } from "@/lib/domain/dateRange";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import type { Person } from "@/lib/domain/types";
import { jerusalemLocalTimeToInstant } from "@/lib/time/jerusalemClock";
import { fetchAllUserIdsByEmail, filterManagerRecipients, resolveNotificationRecipients } from "./recipients";
import {
  cancelPendingReminderJob,
  insertNotificationJobIfAbsent,
  upsertPendingReminderJob,
} from "./store";

/**
 * The מטווחים feature's own notification categories -- plain string keys,
 * same convention as every other category in this codebase (`"coverage_gap"`,
 * `"manual"`, ...). No new job-creation path: every function below is a
 * thin wrapper around the EXISTING `notification_jobs` writers in
 * `engine/store.ts` -- never a second scheduler, never a direct Push call
 * (delivery stays owned by the existing worker, `engine/delivery.ts`).
 */
const CATEGORY_SCHEDULED = "shooting_range_scheduled";
const CATEGORY_REMINDER = "shooting_range_reminder";
const CATEGORY_CONFIRMATION_REQUIRED = "shooting_range_confirmation_required";
const CATEGORY_REPORT_DECIDED = "shooting_range_report_decided";
const CATEGORY_SELF_REPORT_SUBMITTED = "shooting_range_self_report_submitted";

const PERSONAL_PATH = "/shooting-ranges";
const MANAGER_PATH = "/shooting-ranges/manager";

/** The day-before-range-date reminder's local Jerusalem send time -- an arbitrary but consistent early-evening slot, matching this codebase's existing reminder-timing convention (see `reminders.ts`'s own fixed local hours). */
const REMINDER_LOCAL_HOUR = 18;
/** The end-of-range-date manager confirmation-required notification's local Jerusalem send time. */
const CONFIRMATION_REQUIRED_LOCAL_HOUR = 20;

/**
 * Notifies every scheduled person immediately (job creation, PR #30-style
 * "outbox" pattern -- delivery/Push is the existing worker's concern) that
 * they've been scheduled for a range, and upserts their day-before reminder
 * job. A person who cannot be resolved to a Supabase account (no email /
 * ambiguous / unmapped) is silently skipped -- same fail-open-on-delivery,
 * fail-closed-on-authorization posture as every other notification path in
 * this codebase (the IN-APP action itself never fails just because a
 * notification couldn't be delivered to one person).
 */
export async function notifyPeopleScheduledForRange(
  people: readonly Person[],
  personIds: readonly string[],
  rangeDate: string,
): Promise<void> {
  const emailToAccount = await fetchAllUserIdsByEmail();
  const targetIds = new Set(personIds);
  const now = new Date().toISOString();
  const reminderInstant = jerusalemLocalTimeToInstant(shiftDateBack(rangeDate), REMINDER_LOCAL_HOUR, 0);

  await Promise.all(
    people
      .filter((person) => targetIds.has(person.id))
      .map(async (person) => {
        const lookup = emailToAccount.get(normalizePersonEmail(person));
        if (!lookup) return;

        await insertNotificationJobIfAbsent({
          category: CATEGORY_SCHEDULED,
          recipientUserId: lookup.userId,
          title: "🎯 שובצת למטווח",
          body: `שובצת למטווח בתאריך ${formatDdMmYyyy(rangeDate)}.`,
          path: PERSONAL_PATH,
          dedupeKey: `${CATEGORY_SCHEDULED}:${rangeDate}:${person.id}`,
          scheduledFor: now,
        });

        if (reminderInstant.getTime() > Date.now()) {
          await upsertPendingReminderJob({
            category: CATEGORY_REMINDER,
            recipientUserId: lookup.userId,
            title: "🎯 תזכורת למטווח מחר",
            body: `מחר (${formatDdMmYyyy(rangeDate)}) מתוכנן מטווח שאתה משובץ אליו.`,
            path: PERSONAL_PATH,
            dedupeKey: `${CATEGORY_REMINDER}:${rangeDate}:${person.id}`,
            scheduledFor: reminderInstant.toISOString(),
          });
        }
      }),
  );
}

/**
 * Upserts (never a second scheduler -- the existing worker's tick still
 * delivers this at its `scheduled_for` time) the end-of-range-date
 * "confirmation required" reminder for every manager, addressed to
 * `/shooting-ranges/manager`. Idempotent per `(rangeDate, manager)` --
 * re-scheduling more people onto the same date before it fires simply
 * upserts the same still-pending per-manager job with a refreshed
 * participant count.
 *
 * The dedupe key is deliberately PER-MANAGER (`rangeDate:userId`), never
 * shared across managers: `upsertPendingReminderJob` upserts on
 * `dedupe_key`, so a shared key across several `Promise.all` calls would
 * have each manager's upsert overwrite the previous one's row -- only the
 * LAST manager in the list would ever actually get a job. This is exactly
 * the class of bug `upsertPendingReminderJob`'s own docstring warns about
 * (a real prior production incident), so every recipient here gets a
 * distinct key even though the job content is otherwise identical.
 */
export async function scheduleManagerConfirmationRequiredJob(
  people: readonly Person[],
  rangeDate: string,
  participantCount: number,
): Promise<void> {
  const resolution = await resolveNotificationRecipients(people);
  const managers = filterManagerRecipients(people, resolution);
  const scheduledFor = jerusalemLocalTimeToInstant(rangeDate, CONFIRMATION_REQUIRED_LOCAL_HOUR, 0);

  await Promise.all(
    managers.map((manager) =>
      upsertPendingReminderJob({
        category: CATEGORY_CONFIRMATION_REQUIRED,
        recipientUserId: manager.userId,
        title: `🎯 המטווח של ${formatDdMm(rangeDate)} הסתיים`,
        body: `${participantCount} אנשים שובצו. נדרש לאשר מי ביצע את המטווח כדי לעדכן את תוקף הכשירות.`,
        path: MANAGER_PATH,
        dedupeKey: confirmationRequiredDedupeKey(rangeDate, manager.userId),
        scheduledFor: scheduledFor.toISOString(),
      }),
    ),
  );
}

/** Cancels the confirmation-required job for `rangeDate` for EVERY manager -- called once a manager resolves the occurrence, so no manager (including ones who didn't act) gets paged for it later that evening once it's already resolved. Re-resolves the current manager list fresh (never trusts a stale list) -- cancelling an already-fired/claimed/absent job is a safe no-op (see `cancelPendingReminderJob`). */
export async function cancelManagerConfirmationRequiredJob(people: readonly Person[], rangeDate: string): Promise<void> {
  const resolution = await resolveNotificationRecipients(people);
  const managers = filterManagerRecipients(people, resolution);
  await Promise.all(managers.map((manager) => cancelPendingReminderJob(confirmationRequiredDedupeKey(rangeDate, manager.userId))));
}

function confirmationRequiredDedupeKey(rangeDate: string, managerUserId: string): string {
  return `${CATEGORY_CONFIRMATION_REQUIRED}:${rangeDate}:${managerUserId}`;
}

/**
 * Immediately notifies every current manager (`Person.isManager`, resolved
 * via the SAME `resolveNotificationRecipients`/`filterManagerRecipients`
 * pair `scheduleManagerConfirmationRequiredJob`/`cancelManagerConfirmationRequiredJob`
 * already use -- never a second/hardcoded manager list) that a new
 * self-report ("ביצעתי מטווח") is waiting for their approval, addressed to
 * `/shooting-ranges/manager`.
 *
 * The dedupe key is per-manager AND keyed off the persisted
 * `shooting_range_completions` row id (`reportId`, as returned by
 * `insertSelfReport`) -- never a shared key across recipients (the same
 * `upsertPendingReminderJob`-class incident `scheduleManagerConfirmationRequiredJob`'s
 * own docstring warns about would apply equally here to a plain
 * `insertNotificationJobIfAbsent` call), and never keyed off something
 * re-derivable/re-triggerable like a date, since a single reporter can
 * submit more than one self-report on the same date.
 */
export async function notifyManagersOfSelfReportSubmitted(
  people: readonly Person[],
  reporterName: string,
  performedOn: string,
  reportId: string,
): Promise<void> {
  const resolution = await resolveNotificationRecipients(people);
  const managers = filterManagerRecipients(people, resolution);
  const now = new Date().toISOString();

  await Promise.all(
    managers.map((manager) =>
      insertNotificationJobIfAbsent({
        category: CATEGORY_SELF_REPORT_SUBMITTED,
        recipientUserId: manager.userId,
        title: "🎯 דיווח מטווח חדש ממתין לאישור",
        body: `${reporterName} דיווח שביצע מטווח בתאריך ${formatDdMmYyyy(performedOn)}.`,
        path: MANAGER_PATH,
        dedupeKey: `${CATEGORY_SELF_REPORT_SUBMITTED}:${reportId}:${manager.userId}`,
        scheduledFor: now,
      }),
    ),
  );
}

/** Immediately notifies a self-reporter of their manager's decision. */
export async function notifySelfReportDecision(
  people: readonly Person[],
  personId: string,
  approved: boolean,
): Promise<void> {
  const person = people.find((candidate) => candidate.id === personId);
  if (!person) return;

  const emailToAccount = await fetchAllUserIdsByEmail();
  const lookup = emailToAccount.get(normalizePersonEmail(person));
  if (!lookup) return;

  await insertNotificationJobIfAbsent({
    category: CATEGORY_REPORT_DECIDED,
    recipientUserId: lookup.userId,
    title: approved ? "✅ דיווח המטווח שלך אושר" : "הדיווח שלך לא אושר",
    body: approved
      ? "מנהל אישר את הדיווח שלך על ביצוע מטווח -- תוקף הכשירות עודכן."
      : "מנהל לא אישר את הדיווח שלך על ביצוע מטווח.",
    path: PERSONAL_PATH,
    dedupeKey: `${CATEGORY_REPORT_DECIDED}:${personId}:${Date.now()}`,
    scheduledFor: new Date().toISOString(),
  });
}

function normalizePersonEmail(person: Person): string {
  return (person.email ?? "").trim().toLowerCase();
}

function formatDdMmYyyy(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function formatDdMm(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

/** One civil day before `isoDate`, via the existing `lib/domain/dateRange.ts` calendar-day arithmetic -- never a second/ad-hoc `Date`-based implementation. */
function shiftDateBack(isoDate: string): string {
  const parsed = parseCalendarDate(isoDate);
  if (!parsed) return isoDate;
  return formatCalendarDate(subtractCalendarDays(parsed, 1));
}
