import "server-only";
import { findPersonByEmail } from "@/lib/auth/resolveCurrentPerson";
import { buildPotentialDutyEvents } from "@/lib/domain/potentialDutyEvents";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { SHEET_SOURCES, type RawSheet, type RawWorkbookSnapshot, type SheetSourceKey } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { parsePotentialSheet } from "@/lib/parsers/potential";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { isCalendarDisplayEvent } from "@/lib/readModels/buildPersonalScheduleReadModel";
import { getWorkbookSnapshot } from "@/lib/sync";
import { resolveCalendarFeedOwnerByToken } from "./feedOwnerLookup";
import { buildCalendarItem } from "./icsItems";
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

  const allEvents = parseScheduleSheet(getSheetByKey(snapshot, "schedule"), people).map(parseEvent);
  const personEvents = allEvents.filter((event) => event.personId === person.id);

  const potentialAllocations = [
    ...parsePotentialSheet(getSheetByKey(snapshot, "potentialH1"), people),
    ...parsePotentialSheet(getSheetByKey(snapshot, "potentialH2"), people),
  ];
  const potentialDutyEvents = buildPotentialDutyEvents(potentialAllocations, person, people, personEvents);

  const calendarEvents = [...personEvents, ...potentialDutyEvents].filter(isCalendarDisplayEvent);
  const items = calendarEvents
    .map((event) => buildCalendarItem(event, shiftSchedule))
    .filter((item) => item !== null);

  const icsText = renderIcsFeed({ personName: person.name, items, generatedAt: new Date() });
  return { status: "ok", icsText };
}
