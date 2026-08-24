import "server-only";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import { getRequestAuthenticatedIdentity } from "@/lib/auth/getRequestAuthenticatedIdentity";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { SHEET_SOURCES, type RawSheet, type RawWorkbookSnapshot, type SheetSourceKey } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getWorkbookSnapshot } from "@/lib/sync";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildSearchReadModel } from "./buildSearchReadModel";
import type { SearchReadModel } from "./searchTypes";

export type SearchReadModelLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  /** No shift schedule to resolve current/next state against -- the global-search feature is simply absent for this request rather than showing a half-broken palette. */
  | { status: "configuration_error" }
  | { status: "ok"; model: SearchReadModel };

/** Same three sources `personalSchedule.ts` requires -- global search never fetches potentialH1/H2. */
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
 * Server-only orchestration for the global command-palette search's safe
 * read model. Deliberately mirrors `personalSchedule.ts`'s own shape
 * (identical required sources, identical fail-closed identity/config
 * handling) rather than threading the already-parsed people/events through
 * from `getRequestPersonalSchedule()` -- `getWorkbookSnapshot`'s own
 * short-TTL cache (`lib/sync/workbookSnapshotCache.ts`) absorbs this
 * request's repeat fetch, the same "independently re-verify, don't thread
 * raw data across read-model boundaries" pattern `loadScheduleReadModel`'s
 * manager branch already uses.
 *
 * Every authenticated person's roster entry and shift events are included
 * -- team-wide directory/shift-status information is a deliberate product
 * decision (not manager-gated the way `ManagerOverviewReadModel`/full
 * coverage-issue analysis is), see this read model's own `README.md`
 * entry. Still never email, sourceSheet/sourceCell, or any manager-only
 * operational field -- see `buildSearchReadModel`/`SearchReadModel`.
 *
 * Identity resolution uses `getRequestAuthenticatedIdentity()` -- the SAME
 * request-scoped `cache()` memoization `personalSchedule.ts`/
 * `managerWorkbookContext.ts` use -- so on `(app)/layout.tsx`'s render
 * (which runs this concurrently with `getRequestPersonalSchedule()`, see
 * that layout's own docs), the live Supabase `getUser()` check is shared
 * rather than performed a second time just for search. Never a second
 * identity primitive, never a persistent cache of the result.
 */
export async function loadSearchReadModel(): Promise<SearchReadModelLoadResult> {
  const identity = await getRequestAuthenticatedIdentity();
  if (identity.status === "unauthenticated") return { status: "unauthenticated" };
  if (identity.status === "missing_email") return { status: "missing_email" };

  const snapshot = await getWorkbookSnapshot(REQUIRED_SOURCES);

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
    if (error instanceof ShiftConfigurationError) return { status: "configuration_error" };
    throw error;
  }

  const rawAssignments = parseScheduleSheet(getSheetByKey(snapshot, "schedule"), people);
  const events = rawAssignments.map(parseEvent);

  const model = buildSearchReadModel({
    people,
    events,
    shiftSchedule,
    meId: identityResult.person.id,
    fetchedAt: snapshot.fetchedAt,
    now: getJerusalemLocalNow(),
  });

  return { status: "ok", model };
}
