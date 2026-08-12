import "server-only";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import {
  fetchRawWorkbookSnapshot,
  SHEET_SOURCES,
  type RawSheet,
  type RawWorkbookSnapshot,
  type SheetSourceKey,
} from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildPersonalScheduleReadModel } from "./buildPersonalScheduleReadModel";
import type { PersonalScheduleReadModel } from "./types";

export type PersonalScheduleLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "configuration_error"; message: string }
  | { status: "ok"; model: PersonalScheduleReadModel };

/**
 * Everything this read model needs from the workbook, and nothing more —
 * potential-duty reconciliation belongs to a later manager feature and is
 * never fetched here.
 */
const REQUIRED_SOURCES: SheetSourceKey[] = ["personnel", "schedule", "settings"];

/** Looks a sheet up by its logical source name rather than trusting snapshot array order. */
function getSheetByKey(snapshot: RawWorkbookSnapshot, key: SheetSourceKey): RawSheet {
  const name = SHEET_SOURCES[key];
  const sheet = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!sheet) {
    throw new Error(`Workbook snapshot is missing the "${name}" sheet.`);
  }
  return sheet;
}

/**
 * Server-only orchestration for the authenticated person's
 * `PersonalScheduleReadModel`:
 *
 * 1. Resolves the Supabase identity; a non-authenticated session never
 *    triggers a Google request at all.
 * 2. Batch-fetches personnel + schedule + settings in a single
 *    `fetchRawWorkbookSnapshot` call (never potentialH1/H2).
 * 3. Parses personnel and resolves the authenticated Person via the same
 *    fail-closed `resolveIdentityAgainstPeople` behavior `resolveCurrentPerson`
 *    uses — no second personnel fetch/parse.
 * 4. On any non-"ok" identity result, returns the same safe typed state
 *    without ever parsing/projecting a personal schedule.
 * 5. Parses the schedule into Events and settings into a `ShiftSchedule`
 *    (fails closed as `configuration_error` — never a default start time).
 * 6. Delegates all read-model construction to the pure, independently
 *    testable `buildPersonalScheduleReadModel`.
 */
export async function loadPersonalScheduleReadModel(): Promise<PersonalScheduleLoadResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status === "unauthenticated") return { status: "unauthenticated" };
  if (identity.status === "missing_email") return { status: "missing_email" };

  const snapshot = await fetchRawWorkbookSnapshot(REQUIRED_SOURCES);

  const people = parsePersonnelSheet(getSheetByKey(snapshot, "personnel"));
  const identityResult = resolveIdentityAgainstPeople(identity, people);

  if (identityResult.status === "unmapped") return { status: "unmapped" };
  if (identityResult.status === "ambiguous_identity") return { status: "ambiguous_identity" };
  if (identityResult.status !== "ok") return { status: identityResult.status };

  const settings = parseSettingsSheet(getSheetByKey(snapshot, "settings"));

  let shiftSchedule: ShiftSchedule;
  try {
    shiftSchedule = buildShiftSchedule(settings.shiftStartTimeDay);
  } catch (error) {
    if (error instanceof ShiftConfigurationError) {
      return { status: "configuration_error", message: error.message };
    }
    throw error;
  }

  const rawAssignments = parseScheduleSheet(getSheetByKey(snapshot, "schedule"), people);
  const events = rawAssignments.map(parseEvent);

  const model = buildPersonalScheduleReadModel({
    person: identityResult.person,
    people,
    events,
    shiftSchedule,
    fetchedAt: snapshot.fetchedAt,
    now: getJerusalemLocalNow(),
  });

  return { status: "ok", model };
}
