import "server-only";
import type { Event } from "@/lib/domain/event";
import type { Person } from "@/lib/domain/types";
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
  LOGISTICS_WITHDRAWAL_NOON_REMINDER_TIME,
  TOMORROW_DUTY_REMINDER_TIME,
  TOMORROW_LOGISTICS_WITHDRAWAL_REMINDER_TIME,
  TOMORROW_SHIFT_REMINDER_TIME,
  type LocalClockTime,
} from "@/lib/config/notificationTiming";
import {
  buildSupervisorAssignedInformedBody,
  buildTeamHelpAssignedBody,
  findLogisticsWithdrawalAssignees,
  resolveEligibleLogisticsTechnicians,
  resolveRelevantSupervisors,
} from "./logisticsCoordination";
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
  tomorrowLogisticsWithdrawalSupervisorJobs: number;
  logisticsWithdrawalNoonAssignedJobs: number;
  logisticsWithdrawalNoonSupervisorJobs: number;
  logisticsWithdrawalNoonTeamJobs: number;
  tomorrowShiftCancelled: number;
  tomorrowDutyCancelled: number;
  tomorrowLogisticsWithdrawalCancelled: number;
  tomorrowLogisticsWithdrawalSupervisorCancelled: number;
  logisticsWithdrawalNoonAssignedCancelled: number;
  logisticsWithdrawalNoonSupervisorCancelled: number;
  logisticsWithdrawalNoonTeamCancelled: number;
  constraintsJobs: number;
}

export interface RemindersInput {
  events: readonly Event[];
  /** Needed only by the logistics-withdrawal team-coordination reminders (`isTechnician` eligibility) -- every other reminder in this file is Event-driven alone. */
  people: readonly Person[];
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
  const tomorrowLogisticsWithdrawalSupervisor = await runTomorrowLogisticsWithdrawalSupervisorReminders(input);
  const logisticsWithdrawalNoon = await runLogisticsWithdrawalNoonReminders(input);
  const constraintsJobs = await runConstraintsReminders(input);

  return {
    tomorrowShiftJobs: tomorrowShift.created,
    tomorrowDutyJobs: tomorrowDuty.created,
    tomorrowLogisticsWithdrawalJobs: tomorrowLogisticsWithdrawal.created,
    tomorrowLogisticsWithdrawalSupervisorJobs: tomorrowLogisticsWithdrawalSupervisor.created,
    logisticsWithdrawalNoonAssignedJobs: logisticsWithdrawalNoon.assigned.created,
    logisticsWithdrawalNoonSupervisorJobs: logisticsWithdrawalNoon.supervisor.created,
    logisticsWithdrawalNoonTeamJobs: logisticsWithdrawalNoon.team.created,
    tomorrowShiftCancelled: tomorrowShift.cancelled,
    tomorrowDutyCancelled: tomorrowDuty.cancelled,
    tomorrowLogisticsWithdrawalCancelled: tomorrowLogisticsWithdrawal.cancelled,
    tomorrowLogisticsWithdrawalSupervisorCancelled: tomorrowLogisticsWithdrawalSupervisor.cancelled,
    logisticsWithdrawalNoonAssignedCancelled: logisticsWithdrawalNoon.assigned.cancelled,
    logisticsWithdrawalNoonSupervisorCancelled: logisticsWithdrawalNoon.supervisor.cancelled,
    logisticsWithdrawalNoonTeamCancelled: logisticsWithdrawalNoon.team.cancelled,
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
      // Names the operational window explicitly (13:00–14:00) rather than
      // the former generic "אתה משובץ" -- part of this feature's team-
      // coordination expansion (see `logisticsCoordination.ts`).
      body: "מחר אתה עושה משיכות בין 13:00–14:00.",
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

// ---------------------------------------------------------------------------
// Tomorrow logistics-withdrawal SUPERVISOR reminder (day-before, 20:00) --
// team-coordination expansion on top of the assigned-person reminder above.
// ---------------------------------------------------------------------------

/**
 * One consolidated 20:00 job per relevant אחמ"ש for TOMORROW's withdrawal
 * window (`resolveRelevantSupervisors` -- structural, never
 * `Person.isSupervisor` alone; empty when no supervisor can be proven, per
 * spec "fail conservatively"). Content branches on whether anyone is
 * currently assigned:
 *
 *  - assigned: informs the supervisor who it is (spec Case A.2) --
 *    excludes any assignee who is ALSO a resolved supervisor recipient
 *    (precedence: a person never gets told about their own assignment
 *    twice under two different roles).
 *  - unassigned: the anti-spam warning (spec Case B.1) -- ONLY the
 *    supervisor is warned the evening before; technicians are deliberately
 *    never notified at this hour (spec: "the assignment may still be
 *    fixed before noon").
 *
 * Same upsert-or-cancel-by-prefix model as every other tomorrow reminder,
 * so a supervisor swap, a newly-proven assignment, or an assignment
 * disappearing all resolve correctly on the next tick.
 */
async function runTomorrowLogisticsWithdrawalSupervisorReminders(
  input: RemindersInput,
): Promise<{ created: number; cancelled: number }> {
  const tomorrowDate = nextCalendarDateString(input.now.date);
  if (!tomorrowDate) return { created: 0, cancelled: 0 };

  const scheduledFor = toIso(input.now.date, TOMORROW_LOGISTICS_WITHDRAWAL_REMINDER_TIME);
  const assignees = findLogisticsWithdrawalAssignees(input.events, tomorrowDate);
  const assignedPersonIds = new Set(assignees.map((assignee) => assignee.personId));
  const supervisors = resolveRelevantSupervisors(input.events, tomorrowDate, input.shiftSchedule).filter(
    (supervisor) => !assignedPersonIds.has(supervisor.personId),
  );

  const { title, body } =
    assignees.length > 0
      ? { title: "📦 משיכות מחר", body: buildSupervisorAssignedInformedBody(assignees.map((a) => a.personName)) }
      : {
          title: "⚠️ לא הוגדר טכנאי למשיכות",
          body: "לא הוגדר טכנאי למשיכות מחר בין 13:00–14:00. נדרש לוודא שכל הטכנאים הזמינים יוצאים למשיכות.",
        };

  const validJobs: NewNotificationJob[] = [];
  for (const supervisor of supervisors) {
    const recipient = input.recipientResolution.resolved.get(supervisor.personId);
    if (!recipient) continue;

    validJobs.push({
      category: "tomorrow_logistics_withdrawal_supervisor",
      recipientUserId: recipient.userId,
      title,
      body,
      path: "/",
      tag: `tomorrow-logistics-withdrawal-supervisor-${tomorrowDate}-${recipient.userId}`,
      dedupeKey: `tomorrow_logistics_withdrawal_supervisor:${tomorrowDate}:${recipient.userId}`,
      scheduledFor,
      sourceRef: `logistics_withdrawal_supervisor:${supervisor.personId}:${tomorrowDate}`,
    });
  }

  return applyReminderJobs("tomorrow_logistics_withdrawal_supervisor", tomorrowDate, validJobs, input.persist);
}

// ---------------------------------------------------------------------------
// Same-day noon (12:00) logistics-withdrawal team coordination:
// assigned technician / supervisor fallback (only if still unassigned) /
// eligible teammates -- all computed together since they share the SAME
// underlying "who's assigned / who's the supervisor / who's eligible"
// query for TODAY's date.
// ---------------------------------------------------------------------------

interface NoonReminderCategorySummary {
  assigned: { created: number; cancelled: number };
  supervisor: { created: number; cancelled: number };
  team: { created: number; cancelled: number };
}

/**
 * Recipient precedence, enforced by construction (spec: "A single user
 * should not receive two pushes for the same logistics purpose/time
 * merely because they hold multiple capability flags"):
 *   1. assigned-person-specific copy (the assignee(s) themselves)
 *   2. supervisor-specific fallback/warning copy (excludes anyone already
 *      an assignee)
 *   3. generic technician-team copy (excludes anyone already an assignee
 *      OR already a supervisor recipient above)
 */
async function runLogisticsWithdrawalNoonReminders(input: RemindersInput): Promise<NoonReminderCategorySummary> {
  const today = input.now.date;
  const scheduledFor = toIso(today, LOGISTICS_WITHDRAWAL_NOON_REMINDER_TIME);

  const assignees = findLogisticsWithdrawalAssignees(input.events, today);
  const assignedPersonIds = new Set(assignees.map((assignee) => assignee.personId));
  const isAssigned = assignees.length > 0;

  const assignedJobs: NewNotificationJob[] = [];
  for (const assignee of assignees) {
    const recipient = input.recipientResolution.resolved.get(assignee.personId);
    if (!recipient) continue;
    assignedJobs.push({
      category: "logistics_withdrawal_noon_assigned",
      recipientUserId: recipient.userId,
      title: "📦 משיכות בעוד שעה",
      body: "היום אתה עושה משיכות בין 13:00–14:00.",
      path: "/",
      tag: `logistics-withdrawal-noon-assigned-${today}-${recipient.userId}`,
      dedupeKey: `logistics_withdrawal_noon_assigned:${today}:${recipient.userId}`,
      scheduledFor,
      sourceRef: `logistics_withdrawal:${assignee.personId}:${today}`,
    });
  }
  const assignedResult = await applyReminderJobs(
    "logistics_withdrawal_noon_assigned",
    today,
    assignedJobs,
    input.persist,
  );

  // Supervisor fallback: ONLY when still unassigned at this tick (spec
  // Case A never lists a noon supervisor message; that's exclusively the
  // Case B anti-spam warning). No supervisor jobs at all once assigned --
  // any previously-upserted warning naturally becomes stale and is
  // cancelled by `applyReminderJobs`'s own prefix sweep.
  const supervisorCandidates = resolveRelevantSupervisors(input.events, today, input.shiftSchedule).filter(
    (supervisor) => !assignedPersonIds.has(supervisor.personId),
  );
  const supervisorJobs: NewNotificationJob[] = [];
  if (!isAssigned) {
    for (const supervisor of supervisorCandidates) {
      const recipient = input.recipientResolution.resolved.get(supervisor.personId);
      if (!recipient) continue;
      supervisorJobs.push({
        category: "logistics_withdrawal_noon_supervisor",
        recipientUserId: recipient.userId,
        title: "⚠️ לא הוגדר טכנאי למשיכות",
        body: "לא הוגדר טכנאי למשיכות היום בין 13:00–14:00. נדרש לוודא שכל הטכנאים הזמינים יוצאים למשיכות.",
        path: "/",
        tag: `logistics-withdrawal-noon-supervisor-${today}-${recipient.userId}`,
        dedupeKey: `logistics_withdrawal_noon_supervisor:${today}:${recipient.userId}`,
        scheduledFor,
        sourceRef: `logistics_withdrawal_supervisor:${supervisor.personId}:${today}`,
      });
    }
  }
  const supervisorResult = await applyReminderJobs(
    "logistics_withdrawal_noon_supervisor",
    today,
    supervisorJobs,
    input.persist,
  );

  // Eligible teammates, excluding anyone already reached above (precedence).
  const supervisorRecipientPersonIds = new Set(supervisorCandidates.map((supervisor) => supervisor.personId));
  const eligibleTechnicians: readonly Person[] = resolveEligibleLogisticsTechnicians(
    input.events,
    input.people,
    today,
    input.shiftSchedule,
  ).filter((person) => !assignedPersonIds.has(person.id) && !supervisorRecipientPersonIds.has(person.id));

  const { title: teamTitle, body: teamBody } = isAssigned
    ? { title: "🤝 משיכות היום", body: buildTeamHelpAssignedBody(assignees.map((a) => a.personName)) }
    : {
        title: "📦 משיכות היום",
        body: "לא הוגדר טכנאי למשיכות היום. כל הטכנאים הזמינים נדרשים לצאת למשיכות בין 13:00–14:00.",
      };

  const teamJobs: NewNotificationJob[] = [];
  for (const person of eligibleTechnicians) {
    const recipient = input.recipientResolution.resolved.get(person.id);
    if (!recipient) continue;
    teamJobs.push({
      category: "logistics_withdrawal_noon_team",
      recipientUserId: recipient.userId,
      title: teamTitle,
      body: teamBody,
      path: "/",
      tag: `logistics-withdrawal-noon-team-${today}-${recipient.userId}`,
      dedupeKey: `logistics_withdrawal_noon_team:${today}:${recipient.userId}`,
      scheduledFor,
      sourceRef: `logistics_withdrawal_team:${person.id}:${today}`,
    });
  }
  const teamResult = await applyReminderJobs("logistics_withdrawal_noon_team", today, teamJobs, input.persist);

  return { assigned: assignedResult, supervisor: supervisorResult, team: teamResult };
}

/** Every dedupe-key prefix any reminder category above ever uses -- kept as a union so `applyReminderJobs` can't be called with a typo'd/unrelated category string. */
type ReminderCategory =
  | "tomorrow_shift"
  | "tomorrow_duty"
  | "tomorrow_logistics_withdrawal"
  | "tomorrow_logistics_withdrawal_supervisor"
  | "logistics_withdrawal_noon_assigned"
  | "logistics_withdrawal_noon_supervisor"
  | "logistics_withdrawal_noon_team";

/**
 * Shared upsert-or-cancel application for every time-based reminder
 * category (both the day-before-at-20:00 ones and the same-day-at-12:00
 * logistics-coordination ones): every job whose content is still valid
 * this tick is upserted (creating it, or refreshing its content/recipient
 * if the underlying assignment changed before send -- spec sections
 * 16-17); every previously-created, still-pending job for the same
 * `dateKey` whose dedupe_key is no longer among the valid set (the
 * assignment disappeared, moved to a different recipient, or the
 * recipient set itself changed) is cancelled. `dateKey` is whichever
 * calendar date the category's own dedupe-key scheme uses (tomorrow's
 * date for the 20:00 categories, today's date for the noon ones) -- never
 * assumed to be "tomorrow" specifically.
 */
async function applyReminderJobs(
  category: ReminderCategory,
  dateKey: string,
  validJobs: readonly NewNotificationJob[],
  persist: boolean,
): Promise<{ created: number; cancelled: number }> {
  if (!persist) {
    return { created: validJobs.length, cancelled: 0 };
  }

  for (const job of validJobs) {
    await upsertPendingReminderJob(job);
  }

  const prefix = `${category}:${dateKey}:`;
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
