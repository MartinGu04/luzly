import { addCalendarDays, formatCalendarDate, subtractCalendarDays } from "./dateRange";
import { isNextCalendarDay, parseCalendarDate } from "./dutyBlocks";
import type { Event, EventRole } from "./event";
import { BLOCKING_ABSENCE_KINDS, type OperationalIssue } from "./operationalIssues";
import { findShiftGroupEvents } from "./shiftCoverage";
import { MINUTES_PER_DAY, resolveEventShiftInterval, type MinuteInterval, type ShiftSchedule } from "./shiftSchedule";
import type { Person } from "./types";

/**
 * PR #37 -- a deterministic, conservative "who might be worth checking
 * with?" candidate search for a coverage problem, built ENTIRELY on
 * already-existing domain facts. This never invents availability: a
 * person is only ever a candidate when every check below can be proven
 * from already-parsed data. Mi-Ma-Mo does not know about a constraint
 * communicated outside the product (e.g. a WhatsApp message) -- that
 * limitation is real and is reflected honestly by the presentation layer
 * (`lib/presentation/issueRecommendation.ts`), never papered over here.
 *
 * Reuses the SAME coverage/interval primitives every other part of this
 * domain uses (`resolveEventShiftInterval`, `findShiftGroupEvents`,
 * `BLOCKING_ABSENCE_KINDS`) -- this is not a second coverage engine, only
 * a candidate SEARCH over `OperationalIssue`'s already-detected problem.
 */

export type MissingCoverageRole = "technician" | "supervisor";

/** Show at most this many candidates -- never a "smart ranking", just a stable deterministic short list. */
export const MAX_RECOMMENDATION_CANDIDATES = 3;

export interface ShiftCoverageRecommendation {
  missingRole: MissingCoverageRole;
  /** Deterministically ordered (name, then id), at most `MAX_RECOMMENDATION_CANDIDATES`. */
  primaryCandidateIds: string[];
  /**
   * Last-resort fallback: supervisors who are ALSO explicitly
   * `isTechnician === true`. Only ever non-empty when `missingRole ===
   * "technician"` AND `primaryCandidateIds` is empty -- never populated
   * for a missing supervisor (no reverse fallback exists), and never
   * computed at all once a regular technician candidate already qualifies.
   */
  fallbackCandidateIds: string[];
}

function oppositeRole(role: EventRole): MissingCoverageRole | null {
  if (role === "supervisor") return "technician";
  if (role === "technician") return "supervisor";
  return null;
}

function compareCandidates(a: Person, b: Person): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function orderAndLimit(candidates: readonly Person[]): string[] {
  return [...candidates].sort(compareCandidates).slice(0, MAX_RECOMMENDATION_CANDIDATES).map((person) => person.id);
}

// ---------------------------------------------------------------------------
// Eligibility -- every check must be satisfied; the first failing check
// excludes the candidate. Nothing here guesses: an unresolvable/ambiguous
// signal excludes conservatively rather than being treated as proof of
// either availability or conflict.
// ---------------------------------------------------------------------------

/** `date` shifted by `dayOffset` civil days (may be negative) -- the missing counterpart `addCalendarDays`/`subtractCalendarDays` need to be combined for, since neither alone accepts a signed offset. Falls back to `date` unchanged for a structurally invalid date, which should never occur with real domain data. */
function shiftCalendarDate(date: string, dayOffset: number): string {
  const parsed = parseCalendarDate(date);
  if (!parsed) return date;
  const shifted = dayOffset >= 0 ? addCalendarDays(parsed, dayOffset) : subtractCalendarDays(parsed, -dayOffset);
  return formatCalendarDate(shifted);
}

/**
 * Every calendar date the missing coverage interval(s) actually touch --
 * always at least the issue's own date, plus one more for every extra
 * midnight a `MinuteInterval` (anchored to the issue's date, values past
 * 1439 meaning "the following day") crosses. An overnight night-shift gap
 * that reaches into the early morning of the NEXT date genuinely touches
 * that date too -- a known-absence/constraint safety check that only ever
 * looked at the issue's own date would silently miss it.
 */
function datesTouchedByMissingIntervals(issueDate: string, missingIntervals: readonly MinuteInterval[]): Set<string> {
  const dayOffsets = new Set<number>([0]);
  for (const interval of missingIntervals) {
    const startDay = Math.floor(interval.startMinute / MINUTES_PER_DAY);
    const endDay = Math.floor((interval.endMinute - 1) / MINUTES_PER_DAY);
    for (let day = startDay; day <= endDay; day++) dayOffsets.add(day);
  }
  return new Set([...dayOffsets].map((offset) => shiftCalendarDate(issueDate, offset)));
}

/**
 * Blocking absence: reuses `BLOCKING_ABSENCE_KINDS` outright -- never a
 * second definition of "blocking" (`after` stays deliberately excluded,
 * exactly like every other blocking-absence check in this domain). Checked
 * against EVERY calendar date the missing interval actually touches
 * (`datesTouchedByMissingIntervals`), not merely the issue's own date --
 * Mi-Ma-Mo already knows about a blocking absence the day after an
 * overnight shift starts, and must not suggest that person just because
 * the absence Event's own `date` differs from the issue's.
 */
function hasBlockingAbsence(candidateEvents: readonly Event[], touchedDates: ReadonlySet<string>): boolean {
  return candidateEvents.some(
    (event) =>
      event.category === "absence" &&
      touchedDates.has(event.date) &&
      event.absenceKind !== null &&
      BLOCKING_ABSENCE_KINDS.has(event.absenceKind),
  );
}

/**
 * A parsed `constraint` Event (e.g. "אילוץ לילה") carries a genuinely
 * STRUCTURED `period` -- day/night/morning/unspecified -- set by the
 * parser from the constraint token itself, not guessed here.
 *
 * `"day"`/`"night"` constraints have the exact same canonical minute
 * window as a shift of that period (`schedule.dayStartMinute`/`dayEndMinute`
 * etc.), placed onto the issue's own timeline via `dayOffsetMinutes` --
 * the same placement rule `hasConflictingOrUnresolvedShift` already uses
 * for the candidate's own nearby shifts. A candidate is excluded only
 * when that canonical constraint interval actually OVERLAPS a missing
 * interval: a "אילוץ לילה" dated the day AFTER an overnight shift refers
 * to the FOLLOWING night, not the early-morning tail of the missing
 * shift, and correctly does not exclude the candidate.
 *
 * `"unspecified"` (the whole day) and `"morning"` have no provable
 * canonical window, so they keep the original conservative rule: any
 * occurrence on a calendar date the missing interval touches
 * (`datesTouchedByMissingIntervals`) excludes the candidate -- Mi-Ma-Mo
 * would rather omit a potentially-valid candidate than suggest someone
 * while already holding an unresolved constraint signal against them;
 * uncertainty must never be read as a positive availability claim.
 */
function hasStructuralConstraintConflict(
  candidateEvents: readonly Event[],
  touchedDates: ReadonlySet<string>,
  issueDate: string,
  missingIntervals: readonly MinuteInterval[],
  schedule: ShiftSchedule,
): boolean {
  for (const event of candidateEvents) {
    if (event.category !== "constraint") continue;

    if (event.period === "day" || event.period === "night") {
      const offset = dayOffsetMinutes(issueDate, event.date);
      if (offset === null) continue;

      const canonicalStart = event.period === "day" ? schedule.dayStartMinute : schedule.nightStartMinute;
      const canonicalEnd = event.period === "day" ? schedule.dayEndMinute : schedule.nightEndMinute;
      const constraintInterval: MinuteInterval = {
        startMinute: canonicalStart + offset,
        endMinute: canonicalEnd + offset,
      };

      if (missingIntervals.some((missing) => intervalsOverlap(constraintInterval, missing))) return true;
      continue;
    }

    if (touchedDates.has(event.date)) return true;
  }
  return false;
}

/**
 * Places `otherDate`'s own minute timeline onto `anchorDate`'s (minute 0 =
 * midnight of `anchorDate`) -- the same placement rule
 * `resolveNowMinuteOnEventTimeline` uses for "now" vs. one Event,
 * generalized here to two arbitrary Events. Returns null when the dates
 * are more than one calendar day apart in either direction: structurally
 * impossible to overlap, since no interval this domain can produce spans
 * more than one midnight (a 12h shift, optionally shifted by a same-window
 * override).
 */
export function dayOffsetMinutes(anchorDate: string, otherDate: string): number | null {
  if (otherDate === anchorDate) return 0;
  if (isNextCalendarDay(anchorDate, otherDate)) return MINUTES_PER_DAY;
  if (isNextCalendarDay(otherDate, anchorDate)) return -MINUTES_PER_DAY;
  return null;
}

function intervalsOverlap(a: MinuteInterval, b: MinuteInterval): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/**
 * True when the candidate has a shift Event that either PROVABLY overlaps
 * one of the missing intervals (converted onto the issue date's own
 * timeline via `dayOffsetMinutes`, so an overnight shift is compared
 * correctly), or whose timing can't be resolved at all within the window
 * that could possibly matter -- an unresolved nearby shift can't be
 * proven safe, so it excludes the candidate rather than being ignored
 * (spec: "if compatibility cannot be established reliably, exclude the
 * candidate rather than guessing"). A shift Event too far away in
 * calendar time to possibly overlap (`dayOffsetMinutes` returns null) is
 * always safely skipped.
 *
 * Duties and other non-shift Events are deliberately NEVER considered
 * here (see this module's own top-level docstring) -- the duty model
 * carries no time-of-day information, so no overlap with a specific
 * missing INTERVAL can ever be proven, and duties/shifts routinely
 * coexist for the same person on the same date elsewhere in this app
 * (see `Dashboard`'s own today timeline). Inventing an exclusivity rule
 * here would contradict that existing product behavior.
 */
function hasConflictingOrUnresolvedShift(
  candidateEvents: readonly Event[],
  issueDate: string,
  missingIntervals: readonly MinuteInterval[],
  schedule: ShiftSchedule,
): boolean {
  for (const event of candidateEvents) {
    if (event.category !== "shift") continue;

    const offset = dayOffsetMinutes(issueDate, event.date);
    if (offset === null) continue;

    const resolution = resolveEventShiftInterval(event, schedule);
    if (resolution.status !== "resolved") return true;

    const candidateInterval: MinuteInterval = {
      startMinute: resolution.interval.startMinute + offset,
      endMinute: resolution.interval.endMinute + offset,
    };

    if (missingIntervals.some((missing) => intervalsOverlap(candidateInterval, missing))) return true;
  }
  return false;
}

function isEligibleCandidate(
  candidate: Person,
  issueDate: string,
  missingIntervals: readonly MinuteInterval[],
  allEvents: readonly Event[],
  schedule: ShiftSchedule,
): boolean {
  const candidateEvents = allEvents.filter((event) => event.personId === candidate.id);
  const touchedDates = datesTouchedByMissingIntervals(issueDate, missingIntervals);

  if (hasBlockingAbsence(candidateEvents, touchedDates)) return false;
  if (hasStructuralConstraintConflict(candidateEvents, touchedDates, issueDate, missingIntervals, schedule)) return false;
  if (hasConflictingOrUnresolvedShift(candidateEvents, issueDate, missingIntervals, schedule)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Pure, deterministic, React-free -- no network/auth/Google/Supabase calls
 * and no internal `Date.now()`. Returns `null` whenever nothing useful and
 * safe can be established: an unsupported issue reason, a target whose
 * role can't be resolved, or -- after every filter -- zero eligible
 * candidates in every pool this issue's missing role allows. A `null`
 * result must always be treated as "no recommendation", never retried
 * with looser rules.
 */
export function buildShiftCoverageRecommendation(
  issue: OperationalIssue,
  people: readonly Person[],
  events: readonly Event[],
  schedule: ShiftSchedule,
): ShiftCoverageRecommendation | null {
  if (issue.reason !== "shift_coverage_missing" && issue.reason !== "shift_coverage_partial") return null;
  if (!issue.targetEvent || !issue.missingIntervals || issue.missingIntervals.length === 0) return null;

  const missingRole = oppositeRole(issue.targetEvent.role);
  if (missingRole === null) return null;

  const targetPeriod = issue.targetEvent.period;
  if (targetPeriod !== "day" && targetPeriod !== "night") return null;

  const missingIntervals = issue.missingIntervals;
  const alreadyOnShift = new Set(
    findShiftGroupEvents(events, issue.date, targetPeriod).map((event) => event.personId),
  );

  const eligiblePool = (pool: readonly Person[]): Person[] =>
    pool
      .filter((person) => !alreadyOnShift.has(person.id))
      .filter((person) => isEligibleCandidate(person, issue.date, missingIntervals, events, schedule));

  if (missingRole === "supervisor") {
    const eligible = eligiblePool(people.filter((person) => person.isSupervisor));
    if (eligible.length === 0) return null;
    return { missingRole, primaryCandidateIds: orderAndLimit(eligible), fallbackCandidateIds: [] };
  }

  const primaryEligible = eligiblePool(people.filter((person) => person.isTechnician && !person.isSupervisor));
  if (primaryEligible.length > 0) {
    return { missingRole, primaryCandidateIds: orderAndLimit(primaryEligible), fallbackCandidateIds: [] };
  }

  const fallbackEligible = eligiblePool(people.filter((person) => person.isTechnician && person.isSupervisor));
  if (fallbackEligible.length === 0) return null;
  return { missingRole, primaryCandidateIds: [], fallbackCandidateIds: orderAndLimit(fallbackEligible) };
}
