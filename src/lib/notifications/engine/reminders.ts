import "server-only";
import type { DutyFamily, Event } from "@/lib/domain/event";
import type { Person } from "@/lib/domain/types";
import type { OperationalWeek } from "@/lib/domain/operationalWeek";
import type { LocalNow } from "@/lib/domain/localNow";
import { nextCalendarDateString } from "@/lib/domain/operationalWeek";
import { dayOfWeek, parseCalendarDate, buildDutyBlocks } from "@/lib/domain/dutyBlocks";
import { deriveDutyActions } from "@/lib/domain/dutyActions";
import { resolveEventShiftInterval, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { dutyFamilyLabel, periodLabel } from "@/lib/presentation/labels";
import { jerusalemLocalTimeToInstant } from "@/lib/time/jerusalemClock";
import { resolveMotzashShabbatInstant } from "@/lib/time/motzashShabbat";
import {
  ALMASH_CHECKIN_REMINDER_TIME,
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
  isLogisticsWithdrawalFallbackDate,
  resolveEligibleLogisticsTechnicians,
  resolveRelevantSupervisors,
} from "./logisticsCoordination";
import { isLogisticsWithdrawalEvent } from "./logisticsWithdrawal";
import { fetchAllAuthUserIds, type RecipientResolution } from "./recipients";
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
  almashCheckInJobs: number;
  tomorrowShiftCancelled: number;
  tomorrowDutyCancelled: number;
  tomorrowLogisticsWithdrawalCancelled: number;
  tomorrowLogisticsWithdrawalSupervisorCancelled: number;
  logisticsWithdrawalNoonAssignedCancelled: number;
  logisticsWithdrawalNoonSupervisorCancelled: number;
  logisticsWithdrawalNoonTeamCancelled: number;
  almashCheckInCancelled: number;
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
  const almashCheckIn = await runAlmashCheckInReminders(input);
  const constraintsJobs = await runConstraintsReminders(input);

  return {
    tomorrowShiftJobs: tomorrowShift.created,
    tomorrowDutyJobs: tomorrowDuty.created,
    tomorrowLogisticsWithdrawalJobs: tomorrowLogisticsWithdrawal.created,
    tomorrowLogisticsWithdrawalSupervisorJobs: tomorrowLogisticsWithdrawalSupervisor.created,
    logisticsWithdrawalNoonAssignedJobs: logisticsWithdrawalNoon.assigned.created,
    logisticsWithdrawalNoonSupervisorJobs: logisticsWithdrawalNoon.supervisor.created,
    logisticsWithdrawalNoonTeamJobs: logisticsWithdrawalNoon.team.created,
    almashCheckInJobs: almashCheckIn.created,
    tomorrowShiftCancelled: tomorrowShift.cancelled,
    tomorrowDutyCancelled: tomorrowDuty.cancelled,
    tomorrowLogisticsWithdrawalCancelled: tomorrowLogisticsWithdrawal.cancelled,
    tomorrowLogisticsWithdrawalSupervisorCancelled: tomorrowLogisticsWithdrawalSupervisor.cancelled,
    logisticsWithdrawalNoonAssignedCancelled: logisticsWithdrawalNoon.assigned.cancelled,
    logisticsWithdrawalNoonSupervisorCancelled: logisticsWithdrawalNoon.supervisor.cancelled,
    logisticsWithdrawalNoonTeamCancelled: logisticsWithdrawalNoon.team.cancelled,
    almashCheckInCancelled: almashCheckIn.cancelled,
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
      // Includes `event.period`, same as `dedupeKey` below -- a person
      // can structurally have two distinct shift Events on the same
      // date with different periods (e.g. day + night); without period
      // here the second push would silently replace the first at the
      // OS/Notifications-API level (the tag collision class PR #62
      // found for almash_check_in) even though both stay distinct jobs.
      tag: `tomorrow-shift-${tomorrowDate}-${recipient.userId}-${event.period}`,
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
      // Includes dutyFamily/slot, same as `dedupeKey` -- confirmed the
      // same tag-collision class PR #62 found for almash_check_in: a
      // person can have two concurrent tomorrow-duty Events on the same
      // date (different family/slot), which stay distinct jobs but would
      // otherwise collapse to one OS-level notification.
      tag: `tomorrow-duty-${tomorrowDate}-${recipient.userId}-${event.dutyFamily}-${event.slot ?? ""}`,
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
 *  - assigned: informs the supervisor who it is (spec Case A.2) -- works on
 *    ANY weekday (an explicit "משיכות" Event is always an intentional
 *    withdrawal, Monday or not) -- excludes any assignee who is ALSO a
 *    resolved supervisor recipient (precedence: a person never gets told
 *    about their own assignment twice under two different roles).
 *  - unassigned: the anti-spam warning (spec Case B.1) -- ONLY when
 *    tomorrow is genuinely a logistics-withdrawal date
 *    (`isLogisticsWithdrawalFallbackDate` -- Monday; withdrawals are not
 *    operationally expected any other day, so an unassigned Tuesday is not
 *    a gap worth warning about). Even on a qualifying date, ONLY the
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
  const isAssigned = assignees.length > 0;
  const participatesTomorrow = isAssigned || isLogisticsWithdrawalFallbackDate(tomorrowDate);

  const supervisors = participatesTomorrow
    ? resolveRelevantSupervisors(input.events, tomorrowDate, input.shiftSchedule).filter(
        (supervisor) => !assignedPersonIds.has(supervisor.personId),
      )
    : [];

  const { title, body } = isAssigned
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
  // An explicit "משיכות" Event works on any weekday; the UNASSIGNED
  // fallback (supervisor warning + all-hands teammate message) only ever
  // exists on a genuine logistics-withdrawal date (Monday) -- see
  // `isLogisticsWithdrawalFallbackDate`'s own docstring.
  const participatesToday = isAssigned || isLogisticsWithdrawalFallbackDate(today);

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
  // Case B anti-spam warning) AND today is a genuine logistics-withdrawal
  // date (`participatesToday`). No supervisor jobs at all once assigned,
  // or on a non-Monday with nothing assigned -- any previously-upserted
  // warning naturally becomes stale and is cancelled by
  // `applyReminderJobs`'s own prefix sweep.
  const supervisorCandidates = participatesToday
    ? resolveRelevantSupervisors(input.events, today, input.shiftSchedule).filter(
        (supervisor) => !assignedPersonIds.has(supervisor.personId),
      )
    : [];
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
  // Same `participatesToday` gate as the supervisor fallback: on a
  // non-Monday with nothing assigned, there is no team notification either
  // (spec: "create zero logistics fallback jobs").
  const supervisorRecipientPersonIds = new Set(supervisorCandidates.map((supervisor) => supervisor.personId));
  const eligibleTechnicians: readonly Person[] = participatesToday
    ? resolveEligibleLogisticsTechnicians(input.events, input.people, today, input.shiftSchedule).filter(
        (person) => !assignedPersonIds.has(person.id) && !supervisorRecipientPersonIds.has(person.id),
      )
    : [];

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

// ---------------------------------------------------------------------------
// עלמ״ש check-in reminder (שמירה / עתודה / אוקסיד only)
// ---------------------------------------------------------------------------

/**
 * Only these three duty families get an עלמ״ש check-in push -- NOT every
 * family `deriveDutyActions()` produces a `duty_check_in` action for
 * (kitchen/rasar/callup also get one, but are out of scope here by product
 * decision). Filtered here, at the notification boundary, rather than by
 * changing `deriveDutyActions()` itself -- that function's broader output
 * is still correct domain data for its existing UI consumers
 * (`duties/page.tsx`, `TodayTimeline`); this is a narrower selection ON
 * TOP of it, never a fork of it.
 */
const ALMASH_CHECKIN_DUTY_FAMILIES: ReadonlySet<DutyFamily> = new Set<DutyFamily>(["guard", "reserve", "oxid"]);

/**
 * Reuses `buildDutyBlocks`/`deriveDutyActions` (the SAME domain functions
 * `duties/page.tsx` already renders from) rather than re-deriving
 * check-in dates from `Event`s directly -- so multi-day block semantics
 * (check-in on every actual duty date EXCEPT the final day), dedup, and
 * source-event traceability all come for free and can never drift from
 * what the Duties page itself shows.
 *
 * Fires the SAME calendar day as the check-in (`action.date`), not the
 * day before -- this is a same-day "noon-style" reminder like
 * `logistics_withdrawal_noon_*`, not a day-before "tomorrow-style" one.
 * Sunday-Friday: 12:45 (a quarter hour before the 13:00 check-in).
 * Saturday: the actual מוצ״ש for that date (`resolveMotzashShabbatInstant`)
 * -- 13:00/12:45 are never reachable/relevant on a Saturday, and מוצ״ש
 * itself IS the real check-in moment then, not a 15-minutes-early nudge.
 * A date whose מוצ״ש can't be resolved (should be unreachable --
 * `action.date` always comes from a previously-validated `Event.date`)
 * is skipped rather than falling back to a guessed clock time.
 */
async function runAlmashCheckInReminders(input: RemindersInput): Promise<{ created: number; cancelled: number }> {
  const today = input.now.date;
  const todayParsed = parseCalendarDate(today);
  if (!todayParsed) return { created: 0, cancelled: 0 };

  const isSaturday = dayOfWeek(todayParsed) === 6;
  const scheduledFor = isSaturday
    ? resolveMotzashShabbatInstant(today)?.toISOString()
    : toIso(today, ALMASH_CHECKIN_REMINDER_TIME);
  if (!scheduledFor) return { created: 0, cancelled: 0 };

  const dutyBlocks = buildDutyBlocks(input.events);
  const todayActions = deriveDutyActions(dutyBlocks).filter(
    (action) => action.date === today && ALMASH_CHECKIN_DUTY_FAMILIES.has(action.dutyBlock.dutyFamily),
  );

  const validJobs: NewNotificationJob[] = [];
  for (const action of todayActions) {
    const recipient = input.recipientResolution.resolved.get(action.personId);
    if (!recipient) continue;

    const label = dutyFamilyLabel(action.dutyBlock.dutyFamily);
    const { title, body } = isSaturday
      ? { title: "🫡 הגיע הזמן לעלמ״ש", body: `יש לך הערב עלמ״ש ל${label}` }
      : { title: "🫡 עלמ״ש בעוד רבע שעה", body: `יש לך היום עלמ״ש ל${label} — מתחילים ב־13:00` };

    const slot = action.dutyBlock.slot ?? "";
    validJobs.push({
      category: "almash_check_in",
      recipientUserId: recipient.userId,
      title,
      body,
      path: "/duties",
      // Must include dutyFamily/slot, same as `dedupeKey` below -- the
      // service worker passes this tag straight through to
      // `showNotification()` (`public/sw.js`), where the Notifications
      // API replaces/collapses any existing OS-level notification with
      // the same tag. A coarser tag (date+recipient alone) would silently
      // drop a second legitimate same-day almash push for one person
      // (e.g. two concurrent duty families/slots) even though both stay
      // fully distinct logical jobs in notification_jobs/the inbox.
      tag: `almash-check-in-${today}-${recipient.userId}-${action.dutyBlock.dutyFamily}-${slot}`,
      dedupeKey: `almash_check_in:${today}:${recipient.userId}:${action.dutyBlock.dutyFamily}:${slot}`,
      scheduledFor,
      sourceRef: `duty:${action.personId}:${action.date}`,
    });
  }

  return applyReminderJobs("almash_check_in", today, validJobs, input.persist);
}

/** Every dedupe-key prefix any reminder category above ever uses -- kept as a union so `applyReminderJobs` can't be called with a typo'd/unrelated category string. */
type ReminderCategory =
  | "tomorrow_shift"
  | "tomorrow_duty"
  | "tomorrow_logistics_withdrawal"
  | "tomorrow_logistics_withdrawal_supervisor"
  | "logistics_withdrawal_noon_assigned"
  | "logistics_withdrawal_noon_supervisor"
  | "logistics_withdrawal_noon_team"
  | "almash_check_in";

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

/**
 * Recipient source is EVERY real auth account (`fetchAllAuthUserIds`) --
 * account-wide by product intent, same as before, but no longer gated on
 * push-subscription state (that was the constraints-reminder exception
 * to the "Push is a delivery channel, not inbox eligibility" invariant
 * every other category already follows -- a user with Push disabled must
 * still see this in their Notification Center; `runDelivery` already
 * correctly no-ops Push for a recipient with zero subscriptions without
 * affecting the job/inbox item itself). Deliberately still NEVER filtered
 * through כ"א/roster/email mapping -- that would narrow the audience,
 * not just its delivery channel, which is a different, unrequested change.
 */
async function buildConstraintsJobs(
  input: RemindersInput,
  category: "constraints_sunday" | "constraints_monday",
  time: LocalClockTime,
  copy: { title: string; body: string },
): Promise<NewNotificationJob[]> {
  const userIds = await fetchAllAuthUserIds();
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
