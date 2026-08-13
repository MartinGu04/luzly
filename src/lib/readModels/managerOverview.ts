import "server-only";
import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import { resolveManagerDateRange } from "@/lib/domain/dateRange";
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
import { parsePotentialSheet } from "@/lib/parsers/potential";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildManagerOverviewReadModel } from "./buildManagerOverviewReadModel";
import { getRequestPersonalSchedule } from "./getRequestPersonalSchedule";
import type { ManagerOverviewParams } from "./managerOverviewParams";
import type { ManagerOverviewReadModel } from "./managerTypes";

export type ManagerOverviewLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "configuration_error"; message: string }
  /** Authenticated + mapped, but `person.isManager !== true` -- no manager-wide fetch was ever performed. */
  | { status: "forbidden" }
  | { status: "ok"; model: ManagerOverviewReadModel };

/**
 * Everything the manager overview needs, on top of what the personal
 * loader already covers -- one additional manager-only batch fetch.
 * Never requested for a non-manager (see `loadManagerOverviewReadModel`).
 */
const MANAGER_SOURCES: SheetSourceKey[] = ["personnel", "schedule", "settings", "potentialH1", "potentialH2"];

function getSheetByKey(snapshot: RawWorkbookSnapshot, key: SheetSourceKey): RawSheet {
  const name = SHEET_SOURCES[key];
  const sheet = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!sheet) {
    throw new Error(`Manager workbook snapshot is missing the "${name}" sheet.`);
  }
  return sheet;
}

/**
 * Server-only orchestration for `ManagerOverviewReadModel`. Security
 * boundary matters more than fetch-count minimization here (see PR #14):
 *
 * 1. Reuses `getRequestPersonalSchedule()` (request-scoped, shared with
 *    the protected layout) as the FIRST authorization gate -- every
 *    existing auth/config state passes through unchanged, and a
 *    non-manager never triggers the manager-only fetch below at all.
 * 2. Only once that result is "ok" AND `model.person.isManager === true`
 *    does this fetch the manager-wide batch (personnel + schedule +
 *    settings + potentialH1 + potentialH2) -- one additional Google
 *    request, never performed for a normal user or a non-manager hitting
 *    `/manager`.
 * 3. Defense in depth: re-resolves the authenticated identity against the
 *    FRESH manager snapshot's own freshly-parsed personnel sheet, and
 *    re-checks `isManager` there too. If that second check fails for any
 *    reason (personnel changed between the two fetches, a stale/edited
 *    record, anything), this fails closed as "forbidden" -- the already-
 *    fetched manager data is discarded, never rendered.
 */
export async function loadManagerOverviewReadModel(
  params: ManagerOverviewParams,
): Promise<ManagerOverviewLoadResult> {
  const personalResult = await getRequestPersonalSchedule();

  if (personalResult.status === "unauthenticated") return { status: "unauthenticated" };
  if (personalResult.status === "missing_email") return { status: "missing_email" };
  if (personalResult.status === "unmapped") return { status: "unmapped" };
  if (personalResult.status === "ambiguous_identity") return { status: "ambiguous_identity" };
  if (personalResult.status === "configuration_error") {
    return { status: "configuration_error", message: personalResult.message };
  }

  if (!personalResult.model.person.isManager) {
    return { status: "forbidden" };
  }

  const snapshot = await fetchRawWorkbookSnapshot(MANAGER_SOURCES);

  // Defense in depth: re-verify identity + manager status against the FRESH snapshot, never trust the first check alone.
  const identity = await getAuthenticatedIdentity();
  const people = parsePersonnelSheet(getSheetByKey(snapshot, "personnel"));
  const identityResult = resolveIdentityAgainstPeople(identity, people);

  if (identityResult.status !== "ok" || !identityResult.person.isManager) {
    return { status: "forbidden" };
  }

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

  const potentialAllocations = [
    ...parsePotentialSheet(getSheetByKey(snapshot, "potentialH1"), people),
    ...parsePotentialSheet(getSheetByKey(snapshot, "potentialH2"), people),
  ];

  const now = getJerusalemLocalNow();
  const range = resolveManagerDateRange(params.range, params.month, now);

  const model = buildManagerOverviewReadModel({
    manager: identityResult.person,
    people,
    events,
    potentialAllocations,
    shiftSchedule,
    fetchedAt: snapshot.fetchedAt,
    now,
    range,
    selectedPersonId: params.personId,
    problemsOnly: params.problemsOnly,
  });

  return { status: "ok", model };
}
