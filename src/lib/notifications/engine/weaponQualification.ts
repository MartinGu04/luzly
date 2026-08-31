import "server-only";
import { createHash } from "node:crypto";
import type { Event } from "@/lib/domain/event";
import { detectWeaponQualificationIssues, type OperationalIssue } from "@/lib/domain/operationalIssues";
import type { Person } from "@/lib/domain/types";
import type { ShootingRangeRelevanceRecord, ShootingRangeSheetRecord } from "@/lib/parsers/shootingRanges";
import { formatCompactDate } from "@/lib/presentation/hebrewDate";
import { getCompletionsForPersonIds } from "@/lib/shootingRanges/store";
import { buildWeaponQualificationIndex } from "@/lib/readModels/shootingRangeQualification";
import { filterManagerRecipients, type RecipientResolution } from "./recipients";
import { getLatestNotificationSourceRef, insertNotificationJobIfAbsent } from "./store";

/**
 * A SINGLE aggregate manager notification per tick per manager -- never one
 * per underlying issue (spec: production notification-spam incident, 39
 * invalid guard/reserve/oxid assignments produced 39 separate pushes to
 * every manager). Aggregation is a NOTIFICATION-layer concern ONLY:
 * `detectWeaponQualificationIssues` below still returns every individual
 * `OperationalIssue`, completely undeduplicated -- Manager Area's "דורש
 * טיפול" (`buildManagerOverviewReadModel.ts`, a SEPARATE call to the same
 * function) is never touched by anything in this file and stays fully
 * granular.
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
 * unit the aggregate/dedupe strategy below reasons about: "has THIS
 * specific problem already been included in a notification we already
 * sent", never a raw issue-object identity/index. `null` only in the
 * structurally-unreachable case of a `weapon_qualification_invalid` issue
 * with no `targetEvent`/`dutyFamily` (`detectWeaponQualificationIssues`
 * itself never produces one without both).
 */
function issueKey(issue: OperationalIssue): string | null {
  const dutyFamily = issue.targetEvent?.dutyFamily ?? null;
  if (!dutyFamily) return null;
  return `${issue.personId}:${issue.date}:${dutyFamily}`;
}

/** A short, stable, deterministic key suffix for a given SORTED set of issue keys -- content-derived (never random/timestamp-based, per spec), so the SAME set always produces the SAME dedupe key regardless of which tick computed it. */
function hashIssueKeys(sortedKeys: readonly string[]): string {
  return createHash("sha256").update(sortedKeys.join("\n"), "utf8").digest("hex").slice(0, 16);
}

/** The set of issue keys a PRIOR aggregate notification already covered for one recipient, decoded from that job's own `source_ref` (a JSON array of `issueKey()` strings, written when that job was created). Missing/malformed/never-notified-before all safely resolve to "nothing known yet" -- never thrown, never treated as a reason to skip notifying. */
function parseCoveredIssueKeys(sourceRef: string | null): ReadonlySet<string> {
  if (!sourceRef) return new Set();
  try {
    const parsed: unknown = JSON.parse(sourceRef);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set();
  }
}

/** Every key in `candidate` is already present in `coveredKeys` -- i.e. `candidate` has nothing NEW relative to what was already covered. An empty `candidate` is trivially a subset of anything. */
function isFullyCovered(candidate: ReadonlySet<string>, coveredKeys: ReadonlySet<string>): boolean {
  for (const key of candidate) {
    if (!coveredKeys.has(key)) return false;
  }
  return true;
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
 * `issuesDetected` count) but never creates a job, mirroring every other
 * dry-run phase in this pipeline (spec section 24: "SEND NO PUSH").
 *
 * AGGREGATION + DEDUPE (spec: fix production notification spam without a
 * new persisted subsystem): every currently-open issue is collapsed into
 * ONE (person, date, dutyFamily) key per real problem, and each manager
 * gets AT MOST one job per tick summarizing the whole set ("39 שיבוצים
 * ... אצל 7 אנשים ... 2.9"), never one job per key. Idempotency across
 * repeated ticks is decided by comparing the CURRENT key set against the
 * key set covered by that manager's own MOST RECENTLY CREATED
 * `weapon_qualification_summary` job -- read back via the EXISTING
 * `notification_jobs.source_ref` column (`getLatestNotificationSourceRef`),
 * never a new table:
 *
 *  - current set fully covered by the last-sent set (unchanged, reordered,
 *    or a strict subset because some issues resolved) -> skip entirely,
 *    for THIS manager. A resolved/removed issue can only ever shrink the
 *    set, never introduce an uncovered key, so a shrinking set alone can
 *    never trigger a fresh notification -- exactly the required behavior.
 *  - current set contains at least one key NOT in the last-sent set (a
 *    genuinely new problem appeared) -> send ONE new aggregate job whose
 *    `source_ref` becomes the current full set (the new high-water mark
 *    for next time), keyed by a content hash of the sorted set (never
 *    random/timestamp-based) so a genuine race between overlapping ticks
 *    still can't create two jobs for the identical content.
 *
 * This decision is made INDEPENDENTLY per manager (each reads back their
 * own last-sent set), so a manager added after an aggregate was already
 * sent to everyone else still gets caught up on their own next eligible
 * tick, and never shares a dedupe key with another recipient (the
 * documented past-incident class this codebase already guards against
 * everywhere else, see `shootingRanges.ts`'s own docs).
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
  if (issues.length === 0 || !persist) return { issuesDetected: issues.length, jobsCreated: 0 };

  const managers = filterManagerRecipients(people, recipientResolution);
  if (managers.length === 0) return { issuesDetected: issues.length, jobsCreated: 0 };

  const currentKeys = new Set<string>();
  for (const issue of issues) {
    const key = issueKey(issue);
    if (key) currentKeys.add(key);
  }
  if (currentKeys.size === 0) return { issuesDetected: issues.length, jobsCreated: 0 };

  const sortedKeys = [...currentKeys].sort();
  const affectedPersonCount = new Set(issues.map((issue) => issue.personId)).size;
  const earliestDate = issues.reduce((min, issue) => (issue.date < min ? issue.date : min), issues[0].date);
  const dateLabel = formatCompactDate(earliestDate) ?? earliestDate;

  const title = "⚠️ בעיות כשירות מטווחים";
  const body = `נמצאו ${assignmentCountLabel(sortedKeys.length)} ללא כשירות מטווחים בתוקף ${affectedPeopleLabel(affectedPersonCount)}. האירוע הקרוב: ${dateLabel}. נדרש טיפול.`;
  const sourceRef = JSON.stringify(sortedKeys);
  const dedupeSuffix = hashIssueKeys(sortedKeys);
  const now = new Date().toISOString();

  let jobsCreated = 0;
  for (const manager of managers) {
    const previousSourceRef = await getLatestNotificationSourceRef(manager.userId, CATEGORY_WEAPON_QUALIFICATION_SUMMARY);
    const coveredKeys = parseCoveredIssueKeys(previousSourceRef);
    if (isFullyCovered(currentKeys, coveredKeys)) continue; // nothing new for this manager since their last aggregate -- never re-notify on an unchanged or shrunken set

    const created = await insertNotificationJobIfAbsent({
      category: CATEGORY_WEAPON_QUALIFICATION_SUMMARY,
      recipientUserId: manager.userId,
      title,
      body,
      path: MANAGER_PATH,
      dedupeKey: `${CATEGORY_WEAPON_QUALIFICATION_SUMMARY}:${manager.userId}:${dedupeSuffix}`,
      scheduledFor: now,
      sourceRef,
    });
    if (created) jobsCreated++;
  }

  return { issuesDetected: issues.length, jobsCreated };
}
