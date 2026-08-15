import "server-only";
import type { Event } from "@/lib/domain/event";
import type { OperationalWeek } from "@/lib/domain/operationalWeek";
import type { LocalNow } from "@/lib/domain/localNow";
import { nextCalendarDateString } from "@/lib/domain/operationalWeek";
import { dayOfWeek, parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { resolveEventShiftInterval, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { dutyFamilyLabel, periodLabel } from "@/lib/presentation/labels";
import { jerusalemLocalTimeToInstant } from "@/lib/time/jerusalemClock";
import {
  CONSTRAINTS_MONDAY_REMINDER_TIME,
  CONSTRAINTS_SUNDAY_REMINDER_TIME,
  TOMORROW_DUTY_REMINDER_TIME,
  TOMORROW_LOGISTICS_WITHDRAWAL_REMINDER_TIME,
  TOMORROW_SHIFT_REMINDER_TIME,
  type LocalClockTime,
} from "@/lib/config/notificationTiming";
import { isLogisticsWithdrawalEvent } from "./logisticsWithdrawal";
import { fetchAllSubscribedUserIds, type RecipientResolution } from "./recipients";
import {
  cancelPendingReminderJob,
  insertNotificationJobIfAbsent,
  listPendingJobDedupeKeysByPrefix,
  upsertPendingReminderJob,
  type NewNotificationJob,
} from "./store";

export interface RemindersSummary {
  tomorrowShiftJobs: number;
  tomorrowDutyJobs: number;
  tomorrowLogisticsWithdrawalJobs: number;
  tomorrowShiftCancelled: number;
  tomorrowDutyCancelled: number;
  tomorrowLogisticsWithdrawalCancelled: number;
  constraintsJobs: number;
}

export interface RemindersInput {
  events: readonly Event[];
  shiftSchedule: ShiftSchedule;
  week: OperationalWeek;
  now: LocalNow;
  persist: boolean;
  recipientResolution: RecipientResolution;
}

function formatMinuteAsClock(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const remaining = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function toIso(dateStr: string, time: LocalClockTime): string {
  return jerusalemLocalTimeToInstant(dateStr, time.hour, time.minute).toISOString();
}

/**
 * Phase 9-10 of the worker pipeline (PR #30 spec section 23): time-based
 * reminder jobs, which are allowed to cross operational-week boundaries
 * (spec sections 16-18) since they are driven purely by calendar date,
 * never by the current/next-week change-notification rule. In dry-run
 * mode (`persist: false`), no job is written -- only computed and
 * counted.
 */
export async function runReminders(input: RemindersInput): Promise<RemindersSummary> {
  const tomorrowShift = await runTomorrowShiftReminders(input);
  const tomorrowDuty = await runTomorrowDutyReminders(input);
  const tomorrowLogisticsWithdrawal = await runTomorrowLogisticsWithdrawalReminders(input);
  const constraintsJobs = await runConstraintsReminders(input);

  return {
    tomorrowShiftJobs: tomorrowShift.created,
    tomorrowDutyJobs: tomorrowDuty.created,
    tomorrowLogisticsWithdrawalJobs: tomorrowLogisticsWithdrawal.created,
    tomorrowShiftCancelled: tomorrowShift.cancelled,
    tomorrowDutyCancelled: tomorrowDuty.cancelled,
    tomorrowLogisticsWithdrawalCancelled: tomorrowLogisticsWithdrawal.cancelled,
    constraintsJobs,
  };
}

// ---------------------------------------------------------------------------
// Tomorrow shift reminder (spec section 16)
// ---------------------------------------------------------------------------

async function runTomorrowShiftReminders(input: RemindersInput): Promise<{ created: number; cancelled: number }> {
  const tomorrowDate = nextCalendarDateString(input.now.date);
  if (!tomorrowDate) return { created: 0, cancelled: 0 };

  const scheduledFor = toIso(input.now.date, TOMORROW_SHIFT_REMINDER_TIME);
  const tomorrowShiftEvents = input.events.filter(
    (event) => event.category === "shift" && event.date === tomorrowDate && !event.shadow,
  );

  const validJobs: NewNotificationJob[] = [];
  for (const event of tomorrowShiftEvents) {
    const recipient = input.recipientResolution.resolved.get(event.personId);
    if (!recipient) continue;

    const resolution = resolveEventShiftInterval(event, input.shiftSchedule);
    const label = periodLabel(event.period);
    const body =
      resolution.status === "resolved"
        ? label
          ? `מחר ב־${formatMinuteAsClock(resolution.interval.startMinute)} מתחילה משמרת ${label} שלך`
          : `מחר ב־${formatMinuteAsClock(resolution.interval.startMinute)} מתחילה המשמרת שלך`
        : label
          ? `מחר יש לך משמרת ${label}`
          : "מחר יש לך משמרת";

    validJobs.push({
      category: "tomorrow_shift",
      recipientUserId: recipient.userId,
      title: "⏰ המשמרת שלך מחר",
      body,
      path: "/",
      tag: `tomorrow-shift-${tomorrowDate}-${recipient.userId}`,
      dedupeKey: `tomorrow_shift:${tomorrowDate}:${recipient.userId}:${event.period}`,
      scheduledFor,
      sourceRef: `shift:${event.personId}:${event.date}`,
    });
  }

  return applyReminderJobs("tomorrow_shift", tomorrowDate, validJobs, input.persist);
}

// ---------------------------------------------------------------------------
// Tomorrow duty reminder (spec section 17)
// ---------------------------------------------------------------------------

async function runTomorrowDutyReminders(input: RemindersInput): Promise<{ created: number; cancelled: number }> {
  const tomorrowDate = nextCalendarDateString(input.now.date);
  if (!tomorrowDate) return { created: 0, cancelled: 0 };

  const scheduledFor = toIso(input.now.date, TOMORROW_DUTY_REMINDER_TIME);
  const tomorrowDutyEvents = input.events.filter(
    (event) => event.category === "duty" && event.date === tomorrowDate && event.dutyFamily !== null,
  );

  const validJobs: NewNotificationJob[] = [];
  for (const event of tomorrowDutyEvents) {
    if (event.dutyFamily === null) continue;
    const recipient = input.recipientResolution.resolved.get(event.personId);
    if (!recipient) continue;

    const label = dutyFamilyLabel(event.dutyFamily);
    validJobs.push({
      category: "tomorrow_duty",
      recipientUserId: recipient.userId,
      title: "🪖 תורנות מתקרבת",
      body: `מחר אתה ${label} — כדאי לבדוק את הפרטים`,
      path: "/duties",
      tag: `tomorrow-duty-${tomorrowDate}-${recipient.userId}`,
      dedupeKey: `tomorrow_duty:${tomorrowDate}:${recipient.userId}:${event.dutyFamily}:${event.slot ?? ""}`,
      scheduledFor,
      sourceRef: `duty:${event.personId}:${event.date}`,
    });
  }

  return applyReminderJobs("tomorrow_duty", tomorrowDate, validJobs, input.persist);
}

// ---------------------------------------------------------------------------
// Tomorrow logistics-withdrawal reminder (משיכות מהלוגיסטיקה)
// ---------------------------------------------------------------------------

/**
 * Automatic, Sheet-derived -- NOT a manager-created notification (that
 * category is explicitly out of scope for PR #30, see spec section 2).
 * Reuses the exact same "current assignment exists tomorrow -> resolve
 * its recipient -> upsert-or-cancel reminder job" shape as the shift/duty
 * reminders above, sourced from `isLogisticsWithdrawalEvent` (see that
 * module's own docstring for why no new parser/column was needed).
 */
async function runTomorrowLogisticsWithdrawalReminders(
  input: RemindersInput,
): Promise<{ created: number; cancelled: number }> {
  const tomorrowDate = nextCalendarDateString(input.now.date);
  if (!tomorrowDate) return { created: 0, cancelled: 0 };

  const scheduledFor = toIso(input.now.date, TOMORROW_LOGISTICS_WITHDRAWAL_REMINDER_TIME);
  const tomorrowLogisticsWithdrawalEvents = input.events.filter(
    (event) => event.date === tomorrowDate && isLogisticsWithdrawalEvent(event),
  );

  const validJobs: NewNotificationJob[] = [];
  for (const event of tomorrowLogisticsWithdrawalEvents) {
    const recipient = input.recipientResolution.resolved.get(event.personId);
    if (!recipient) continue;

    validJobs.push({
      category: "tomorrow_logistics_withdrawal",
      recipientUserId: recipient.userId,
      title: "📦 משיכות מהלוגיסטיקה מחר",
      body: "מחר אתה משובץ למשיכות מהלוגיסטיקה.",
      // No dedicated page represents this assignment -- but it already
      // surfaces generically on the dashboard's todayEvents/upcomingEvents
      // (buildPersonalScheduleReadModel includes every category, unfiltered),
      // so "/" is both the spec's stated fallback AND the page this
      // assignment is factually visible on today.
      path: "/",
      tag: `tomorrow-logistics-withdrawal-${tomorrowDate}-${recipient.userId}`,
      dedupeKey: `tomorrow_logistics_withdrawal:${tomorrowDate}:${recipient.userId}`,
      scheduledFor,
      sourceRef: `logistics_withdrawal:${event.personId}:${event.date}`,
    });
  }

  return applyReminderJobs("tomorrow_logistics_withdrawal", tomorrowDate, validJobs, input.persist);
}

/**
 * Shared upsert-or-cancel application for every tomorrow-reminder
 * category: every job whose content is still valid this tick is
 * upserted (creating it, or refreshing its content/recipient if the
 * underlying assignment changed before send -- spec sections 16-17);
 * every previously-created, still-pending job for the same date whose
 * dedupe_key is no longer among the valid set (the assignment
 * disappeared, or moved to a different recipient, whose dedupe_key
 * differs by construction) is cancelled.
 */
async function applyReminderJobs(
  category: "tomorrow_shift" | "tomorrow_duty" | "tomorrow_logistics_withdrawal",
  tomorrowDate: string,
  validJobs: readonly NewNotificationJob[],
  persist: boolean,
): Promise<{ created: number; cancelled: number }> {
  if (!persist) {
    return { created: validJobs.length, cancelled: 0 };
  }

  for (const job of validJobs) {
    await upsertPendingReminderJob(job);
  }

  const prefix = `${category}:${tomorrowDate}:`;
  const existingKeys = await listPendingJobDedupeKeysByPrefix(prefix);
  const validKeys = new Set(validJobs.map((job) => job.dedupeKey));
  const staleKeys = existingKeys.filter((key) => !validKeys.has(key));

  for (const key of staleKeys) {
    await cancelPendingReminderJob(key);
  }

  return { created: validJobs.length, cancelled: staleKeys.length };
}

// ---------------------------------------------------------------------------
// Weekly constraints reminders (spec section 18)
// ---------------------------------------------------------------------------

async function runConstraintsReminders(input: RemindersInput): Promise<number> {
  const today = parseCalendarDate(input.now.date);
  if (!today) return 0;

  const weekday = dayOfWeek(today);
  let jobs: NewNotificationJob[] = [];

  if (weekday === 0) {
    jobs = await buildConstraintsJobs(input, "constraints_sunday", CONSTRAINTS_SUNDAY_REMINDER_TIME, {
      title: "📌 תזכורת לאילוצים",
      body: "יש אילוץ לשבוע הבא? אפשר לשלוח עד מחר.",
    });
  } else if (weekday === 1) {
    jobs = await buildConstraintsJobs(input, "constraints_monday", CONSTRAINTS_MONDAY_REMINDER_TIME, {
      title: "⏳ היום האחרון לאילוצים",
      body: "אפשר לשלוח אילוצים לשבוע הבא עד סוף היום.",
    });
  } else {
    return 0;
  }

  if (!input.persist) return jobs.length;

  let created = 0;
  for (const job of jobs) {
    const inserted = await insertNotificationJobIfAbsent(job);
    if (inserted) created++;
  }
  return created;
}

async function buildConstraintsJobs(
  input: RemindersInput,
  category: "constraints_sunday" | "constraints_monday",
  time: LocalClockTime,
  copy: { title: string; body: string },
): Promise<NewNotificationJob[]> {
  const userIds = await fetchAllSubscribedUserIds();
  const scheduledFor = toIso(input.now.date, time);

  return userIds.map((userId) => ({
    category,
    recipientUserId: userId,
    title: copy.title,
    body: copy.body,
    path: "/",
    tag: `${category}-${input.week.weekStart}-${userId}`,
    dedupeKey: `${category}:${input.week.weekStart}:${userId}`,
    scheduledFor,
    sourceRef: `constraints:${input.week.weekStart}`,
  }));
}
