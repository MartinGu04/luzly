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
import { buildPersonalScheduleReadModel, toPersonalProfile } from "./buildPersonalScheduleReadModel";
import type { PersonalProfile, PersonalScheduleReadModel } from "./types";

export type PersonalScheduleLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  /**
   * `person` here is the same safe profile as `PersonalScheduleReadModel.person`
   * -- the identity itself resolved successfully; only the shift-schedule
   * *configuration* is broken. This lets the app shell still show who's
   * signed in and offer sign-out while the dashboard content area renders a
   * polished "can't compute shift hours right now" state instead of the
   * real schedule. `message` is for server-side diagnostics only -- the UI
   * must never render it (never the raw exception text).
   *
   * `avatarUrl` (both here and on "ok" below) is carried as a sibling of
   * `person`/`model`, deliberately never folded into `PersonalProfile`/
   * `PersonalScheduleReadModel` themselves -- it comes from the Supabase
   * auth identity, not כ"א/`Person`, and must stay presentation-only,
   * never something the domain/personnel layer could read back and treat
   * as identity data.
   */
  | { status: "configuration_error"; message: string; person: PersonalProfile; avatarUrl: string | null }
  | { status: "ok"; model: PersonalScheduleReadModel; avatarUrl: string | null };

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
      return {
        status: "configuration_error",
        message: error.message,
        person: toPersonalProfile(identityResult.person),
        avatarUrl: identity.avatarUrl,
      };
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

  return { status: "ok", model, avatarUrl: identity.avatarUrl };
}
