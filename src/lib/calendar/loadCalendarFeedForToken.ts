import "server-only";
import { findPersonByEmail } from "@/lib/auth/resolveCurrentPerson";
import { groupEmergencyAssignmentsIntoShifts } from "@/lib/domain/emergencyShift";
import { buildPotentialDutyEvents } from "@/lib/domain/potentialDutyEvents";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { resolveOperationalMode } from "@/lib/emergencyMode/state";
import { SHEET_SOURCES, type RawSheet, type RawWorkbookSnapshot, type SheetSourceKey } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { parsePotentialSheet } from "@/lib/parsers/potential";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { isCalendarDisplayEvent } from "@/lib/readModels/buildPersonalScheduleReadModel";
import { resolveOperationalRoster } from "@/lib/readModels/operationalMode";
import { getWorkbookSnapshot } from "@/lib/sync";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { resolveCalendarFeedOwnerByToken } from "./feedOwnerLookup";
import { isWithinIcsFeedWindow } from "./icsWindow";
import { buildCalendarItem } from "./icsItems";
import { buildEmergencyShiftCalendarItem } from "./icsEmergencyItems";
import { renderIcsFeed } from "./icsRender";

/**
 * Same fixed source set `loadPersonalScheduleReadModel.ts` fetches for the
 * session-authenticated personal schedule -- potentialH1/H2 included so a
 * person whose duty only exists in a תקשא"ס period source still shows up
 * in their own feed, same reasoning as that file's own docstring.
 */
const REQUIRED_SOURCES: SheetSourceKey[] = ["personnel", "schedule", "settings", "potentialH1", "potentialH2"];

/** Looks a sheet up by its logical source name rather than trusting snapshot array order -- same helper `loadPersonalScheduleReadModel.ts` defines for itself; small enough (and tied to `SHEET_SOURCES`, already exported for exactly this) that duplicating it here keeps this module self-contained rather than reaching into that file's private internals. */
function getSheetByKey(snapshot: RawWorkbookSnapshot, key: SheetSourceKey): RawSheet {
  const name = SHEET_SOURCES[key];
  const sheet = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!sheet) {
    throw new Error(`Workbook snapshot is missing the "${name}" sheet.`);
  }
  return sheet;
}

export type CalendarFeedLoadResult = { status: "not_found" } | { status: "ok"; icsText: string };

/**
 * The ICS route's whole pipeline: token -> owning Supabase user's email
 * (`resolveCalendarFeedOwnerByToken`, service-role) -> matching כ"א
 * `Person` (email-only, same fail-closed `findPersonByEmail` a normal
 * session uses) -> that person's shift/duty/absence `Event`s -> rendered
 * `VCALENDAR` text.
 *
 * Every failure mode collapses to `{ status: "not_found" }` -- an unknown/
 * revoked token, a token whose owner's email no longer maps to any כ"א
 * person, or an email matching more than one person (ambiguous, per
 * `findPersonByEmail`) -- so the route can respond 404 uniformly, never
 * distinguishing "wrong token" from "token valid but no data" to an
 * external caller.
 *
 * A broken shift-time configuration (`ShiftConfigurationError`) does NOT
 * fail the whole feed the way it does the in-app dashboard -- an external
 * calendar subscription has no equivalent "can't compute shift hours
 * right now" screen to show, and repeated hard failures risk a calendar
 * client giving up on the subscription entirely. Instead, `shiftSchedule`
 * stays `null` and every shift Event is silently skipped (never given an
 * invented time) while duty/absence Events -- entirely schedule-
 * independent -- are still included; see `icsItems.ts`'s `buildCalendarItem`.
 *
 * The feed's date window (`icsWindow.ts`) is applied HERE ONLY, as the
 * final filter before rendering -- `now - ICS_FEED_PAST_WINDOW_DAYS`
 * through unbounded future. It runs AFTER `buildPotentialDutyEvents`
 * (never before): that function's own "already covered by a real duty
 * Event" dedup needs the person's FULL, unwindowed Event history to stay
 * correct -- windowing `personEvents` first could let an old (out-of-
 * window) real duty Event stop shadowing a Potential allocation on that
 * same date, producing a spurious duplicate for a date that will end up
 * excluded anyway. This window is exclusive to the external feed --
 * `lib/readModels/buildPersonalScheduleReadModel.ts`'s own `calendarEvents`
 * (the in-app "הלוח שלי" personal calendar) is never touched by it.
 */
export async function loadCalendarFeedForToken(token: string): Promise<CalendarFeedLoadResult> {
  const owner = await resolveCalendarFeedOwnerByToken(token);
  if (owner.status !== "ok") return { status: "not_found" };

  const snapshot = await getWorkbookSnapshot(REQUIRED_SOURCES);
  const people = parsePersonnelSheet(getSheetByKey(snapshot, "personnel"));

  const personLookup = findPersonByEmail(people, owner.email);
  if (personLookup.status !== "found") return { status: "not_found" };
  const person = personLookup.person;

  const settings = parseSettingsSheet(getSheetByKey(snapshot, "settings"));
  let shiftSchedule: ShiftSchedule | null = null;
  try {
    shiftSchedule = buildShiftSchedule(settings.shiftStartTimeDay);
  } catch (error) {
    if (!(error instanceof ShiftConfigurationError)) throw error;
  }

  /**
   * Emergency Mode (spec section 16) -- the external ICS subscription has
   * no in-app "unavailable" screen to show, so this branches entirely
   * before touching any regular schedule/Potential data: while Emergency
   * Mode is active, the feed comes EXCLUSIVELY from the person's own
   * desk assignments, never regular shift/duty Events (spec section 4/29
   * -- "never show regular data as current truth"). A broken emergency
   * workbook (`roster.mode === "emergency_unavailable"`) renders an empty
   * but still valid feed rather than ever falling back to regular data --
   * the subscription itself stays alive (never a 404), it simply has
   * nothing to show until the emergency workbook is readable again.
   */
  const operationalMode = await resolveOperationalMode();
  if (operationalMode.kind === "emergency") {
    return loadEmergencyCalendarFeed(person, people, shiftSchedule);
  }

  const allEvents = parseScheduleSheet(getSheetByKey(snapshot, "schedule"), people).map(parseEvent);
  const personEvents = allEvents.filter((event) => event.personId === person.id);

  const potentialAllocations = [
    ...parsePotentialSheet(getSheetByKey(snapshot, "potentialH1"), people),
    ...parsePotentialSheet(getSheetByKey(snapshot, "potentialH2"), people),
  ];
  const potentialDutyEvents = buildPotentialDutyEvents(potentialAllocations, person, people, personEvents);

  const now = getJerusalemLocalNow();
  const calendarEvents = [...personEvents, ...potentialDutyEvents]
    .filter(isCalendarDisplayEvent)
    .filter((event) => isWithinIcsFeedWindow(event.date, now));
  // `allEvents` (every person, unfiltered) is what the shift-roster
  // description (`icsRoster.ts`) needs to find OTHER people's Events on
  // the same date+period -- never the window-filtered `calendarEvents`,
  // and never just this person's own `personEvents`. Synthetic Potential-
  // duty Events are never shift Events (see `buildPotentialDutyEvents`),
  // so they're never relevant to a roster lookup and are correctly left
  // out of this set.
  const items = calendarEvents
    .map((event) => buildCalendarItem(event, shiftSchedule, allEvents))
    .filter((item) => item !== null);

  const icsText = renderIcsFeed({ personName: person.name, items, generatedAt: new Date() });
  return { status: "ok", icsText };
}

/**
 * Emergency Mode branch of the ICS feed (spec section 16) -- mirrors the
 * regular branch's own "resolve -> filter to window -> build items ->
 * render" shape, but sourced entirely from `resolveOperationalRoster`'s
 * desk assignments via `groupEmergencyAssignmentsIntoShifts`, never the
 * regular schedule/Potential sheets (not even fetched here). `roster.mode
 * === "regular"` is structurally unreachable within one request (the
 * caller already observed "emergency" moments earlier, via the SAME
 * request-scoped `resolveOperationalMode()` cache `resolveOperationalRoster`
 * itself calls) -- guarded explicitly rather than silently narrowing the
 * type away, same convention `schedule.ts`'s own emergency branch uses.
 */
async function loadEmergencyCalendarFeed(
  person: Person,
  people: readonly Person[],
  shiftSchedule: ShiftSchedule | null,
): Promise<CalendarFeedLoadResult> {
  const roster = await resolveOperationalRoster(people);
  if (roster.mode === "regular") {
    throw new Error("resolveOperationalRoster reported 'regular' inconsistently within the same request.");
  }
  if (roster.mode === "emergency_unavailable") {
    const icsText = renderIcsFeed({ personName: person.name, items: [], generatedAt: new Date() });
    return { status: "ok", icsText };
  }

  const now = getJerusalemLocalNow();
  const shifts = groupEmergencyAssignmentsIntoShifts(roster.assignments).filter(
    (shift) => isWithinIcsFeedWindow(shift.date, now) && shift.assignments.some((assignment) => assignment.personId === person.id),
  );

  const items = shifts
    .map((shift) => buildEmergencyShiftCalendarItem(shift, person.id, shiftSchedule))
    .filter((item) => item !== null);

  const icsText = renderIcsFeed({ personName: person.name, items, generatedAt: new Date() });
  return { status: "ok", icsText };
}
