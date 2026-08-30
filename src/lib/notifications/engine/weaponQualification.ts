import "server-only";
import type { Event } from "@/lib/domain/event";
import { detectWeaponQualificationIssues } from "@/lib/domain/operationalIssues";
import type { Person } from "@/lib/domain/types";
import type { ShootingRangeRelevanceRecord, ShootingRangeSheetRecord } from "@/lib/parsers/shootingRanges";
import { formatCompactDate } from "@/lib/presentation/hebrewDate";
import { dutyFamilyLabel } from "@/lib/presentation/labels";
import { getCompletionsForPersonIds } from "@/lib/shootingRanges/store";
import { buildWeaponQualificationIndex } from "@/lib/readModels/shootingRangeQualification";
import { isEligibleForShootingRanges } from "@/lib/domain/shootingRangeQualification";
import { filterManagerRecipients, type RecipientResolution } from "./recipients";
import { insertNotificationJobIfAbsent } from "./store";

const CATEGORY_WEAPON_QUALIFICATION_INVALID = "weapon_qualification_invalid";
/** Lands on Manager Area's own "דורש טיפול" section -- the SAME issue this job is announcing, never a shooting-ranges-feature-specific page. */
const MANAGER_PATH = "/manager";

export interface WeaponQualificationCheckResult {
  issuesDetected: number;
  jobsCreated: number;
}

/**
 * The notification worker's own weapon-qualification check (spec: a
 * GENERAL rule over every שמירה/עתודה/אוקסיד activity, never an
 * oxid-specific patch) -- reuses the EXACT SAME `detectWeaponQualificationIssues`
 * "דורש טיפול" already reads for Manager Area, fed from the EXACT SAME
 * `buildWeaponQualificationIndex` the manager overview loader uses (never
 * a second/competing qualification computation). `sheetRecords`/
 * `relevanceRecords` are already parsed by THIS tick's own `freshRead.ts`
 * -- never re-fetched/re-parsed here.
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
 * `issuesDetected` count) but never creates a job, mirroring every other
 * dry-run phase in this pipeline (spec section 24: "SEND NO PUSH").
 *
 * Idempotent per (person, activity date, duty family, manager):
 * `insertNotificationJobIfAbsent`'s unique `dedupe_key` means a tick that
 * observes the SAME still-unresolved problem creates nothing new --
 * exactly one logical notification per underlying occurrence, however many
 * worker ticks re-observe it before it's resolved (a renewed qualification
 * or a changed assignment). Once the activity date itself falls behind
 * `today`, the date filter above removes it from consideration entirely --
 * it neither creates a new job (already covered by the dedupe key) NOR
 * cancels a previously-created one; a job already sent for it stays exactly
 * as it was, a factual record that the problem existed at the time. A
 * genuinely different date/duty-family/person combination is a different
 * key, and gets its own notification. This is a one-shot, immediate ("this
 * is happening") job -- never a future-scheduled `upsertPendingReminderJob`
 * that would need its own cancellation path, since there is nothing to
 * revert before send: the condition is either true right now or it isn't.
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
  const eligiblePersonIds = people.filter((person) => isEligibleForShootingRanges(person)).map((person) => person.id);
  const completions = await getCompletionsForPersonIds(eligiblePersonIds);
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

  const issues = detectWeaponQualificationIssues(upcomingEvents, qualificationByPersonId);
  if (issues.length === 0 || !persist) return { issuesDetected: issues.length, jobsCreated: 0 };

  const managers = filterManagerRecipients(people, recipientResolution);
  if (managers.length === 0) return { issuesDetected: issues.length, jobsCreated: 0 };

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const now = new Date().toISOString();
  let jobsCreated = 0;

  for (const issue of issues) {
    const person = peopleById.get(issue.personId);
    const dutyFamily = issue.targetEvent?.dutyFamily ?? null;
    if (!person || !dutyFamily) continue;

    const activityLabel = dutyFamilyLabel(dutyFamily);
    const dateLabel = formatCompactDate(issue.date) ?? issue.date;
    const title = `⚠️ מטווחים לא בתוקף לקראת ${activityLabel}`;
    const body = `${person.name} משובץ/ת ל${activityLabel} בתאריך ${dateLabel} ללא כשירות מטווחים בתוקף.`;

    for (const manager of managers) {
      const created = await insertNotificationJobIfAbsent({
        category: CATEGORY_WEAPON_QUALIFICATION_INVALID,
        recipientUserId: manager.userId,
        title,
        body,
        path: MANAGER_PATH,
        dedupeKey: `${CATEGORY_WEAPON_QUALIFICATION_INVALID}:${issue.personId}:${issue.date}:${dutyFamily}:${manager.userId}`,
        scheduledFor: now,
      });
      if (created) jobsCreated++;
    }
  }

  return { issuesDetected: issues.length, jobsCreated };
}
