import "server-only";
import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import { SHEET_SOURCES, type RawSheet, type RawWorkbookSnapshot, type SheetSourceKey } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { getWorkbookSnapshot } from "@/lib/sync";
import { getRequestPersonalSchedule } from "./getRequestPersonalSchedule";

export type FairnessWorkbookContextResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "configuration_error"; message: string }
  | { status: "ok"; context: FairnessWorkbookContext };

/** Everything the standalone Fairness experience needs on top of the shared fetch: the freshly re-verified viewer, the full parsed roster, and the raw snapshot to parse further sheets from. */
export interface FairnessWorkbookContext {
  person: Person;
  people: Person[];
  snapshot: RawWorkbookSnapshot;
}

/**
 * PR #4 -- the sources the standalone Fairness experience genuinely needs,
 * and NOTHING more: `personnel` (identity + roster), `schedule` (Shift
 * Fairness's confirmed Events), `potentialH1`/`potentialH2` (Duty
 * Fairness's own Fairness tables, and Shift Fairness's closed-period
 * `reserveParticipation` evidence -- see `reserveParticipation.ts`).
 * Deliberately NOT `settings` -- neither Fairness mode needs
 * `ShiftSchedule`/shift start times, unlike the personal schedule or
 * manager-overview loaders.
 *
 * This is its OWN fixed set, used identically by BOTH modes and every
 * period within a mode (never narrowed per-mode/per-period) specifically
 * so `getWorkbookSnapshot`'s exact-canonical-source-set cache key stays
 * the SAME across a mode switch or a month/H1-H2 navigation -- see
 * `lib/sync/workbookSnapshotCache.ts`'s own docs for why a different
 * source set is a genuine cache miss, not merely a slower hit. Toggling
 * `?mode=`/navigating `?month=`/`?period=` within the cache's short TTL
 * therefore reuses the SAME cached snapshot, never a fresh Google read.
 */
export const FAIRNESS_WORKBOOK_SOURCES: SheetSourceKey[] = ["personnel", "schedule", "potentialH1", "potentialH2"];

export function getFairnessWorkbookSheet(snapshot: RawWorkbookSnapshot, key: SheetSourceKey): RawSheet {
  const name = SHEET_SOURCES[key];
  const sheet = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!sheet) {
    throw new Error(`Fairness workbook snapshot is missing the "${name}" sheet.`);
  }
  return sheet;
}

/**
 * The shared, NON-manager-only authorization + workbook-fetch boundary for
 * the standalone Fairness experience (PR #4). Deliberately NOT
 * `loadManagerWorkbookContext()` -- that loader's `isManager` gate is
 * intentional for the manager-only screens it backs, but `/fairness` is a
 * normal main-navigation destination every mapped user (manager or not)
 * must be able to load. The security sequence itself is otherwise the
 * SAME fail-closed pattern already established there:
 *
 * 1. Reuses `getRequestPersonalSchedule()` (request-scoped, shared with the
 *    protected layout) as the FIRST authorization gate -- every existing
 *    auth/config state (unauthenticated/missing_email/unmapped/
 *    ambiguous_identity/configuration_error) passes through unchanged. A
 *    non-authenticated or unmapped visitor never triggers the Fairness
 *    workbook fetch below at all.
 * 2. Only once that first result is "ok" does this fetch
 *    `FAIRNESS_WORKBOOK_SOURCES` via `getWorkbookSnapshot` (`lib/sync`) --
 *    the same short-TTL cached wrapper every other loader uses, so a
 *    normal user tapping between Fairness periods/modes within the
 *    cache's TTL reuses the same snapshot instead of a fresh Google
 *    request each time.
 * 3. Defense in depth: re-resolves the authenticated identity (a live
 *    Supabase call, NEVER cached) against the (possibly cache-reused)
 *    snapshot's own freshly-parsed personnel sheet. If that second
 *    resolution fails for ANY reason (personnel changed since that
 *    snapshot was fetched, a stale/edited record, anything), this fails
 *    closed with the corresponding auth status -- the already-fetched
 *    Fairness data is discarded, never returned to a caller. There is NO
 *    `isManager` check anywhere in this sequence, by design -- both a
 *    normal mapped user and a manager are equally "ok" here.
 *
 * Callers (`shiftFairness.ts`/`dutyFairness.ts`) parse whichever further
 * sheets their own mode needs from `context.snapshot` themselves -- this
 * helper intentionally stops at the authorized raw snapshot + roster, the
 * same boundary `loadManagerWorkbookContext` draws for manager features.
 */
export async function loadFairnessWorkbookContext(): Promise<FairnessWorkbookContextResult> {
  const personalResult = await getRequestPersonalSchedule();

  if (personalResult.status === "unauthenticated") return { status: "unauthenticated" };
  if (personalResult.status === "missing_email") return { status: "missing_email" };
  if (personalResult.status === "unmapped") return { status: "unmapped" };
  if (personalResult.status === "ambiguous_identity") return { status: "ambiguous_identity" };
  if (personalResult.status === "configuration_error") {
    return { status: "configuration_error", message: personalResult.message };
  }

  const snapshot = await getWorkbookSnapshot(FAIRNESS_WORKBOOK_SOURCES);

  // Defense in depth: re-verify identity against the FRESH snapshot, never trust the first check alone.
  const identity = await getAuthenticatedIdentity();
  const people = parsePersonnelSheet(getFairnessWorkbookSheet(snapshot, "personnel"));
  const identityResult = resolveIdentityAgainstPeople(identity, people);

  if (identityResult.status === "unauthenticated") return { status: "unauthenticated" };
  if (identityResult.status === "missing_email") return { status: "missing_email" };
  if (identityResult.status === "unmapped") return { status: "unmapped" };
  if (identityResult.status === "ambiguous_identity") return { status: "ambiguous_identity" };

  return { status: "ok", context: { person: identityResult.person, people, snapshot } };
}
