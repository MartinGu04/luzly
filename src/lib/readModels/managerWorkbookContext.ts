import "server-only";
import { getRequestAuthenticatedIdentity } from "@/lib/auth/getRequestAuthenticatedIdentity";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import { timedStage, timedSyncStage } from "@/lib/config/timingDiagnostics";
import { SHEET_SOURCES, type RawSheet, type RawWorkbookSnapshot, type SheetSourceKey } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { getWorkbookSnapshot } from "@/lib/sync";

export type ManagerWorkbookContextResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  /** Authenticated + mapped, but `person.isManager !== true` -- no manager-wide fetch was ever performed. */
  | { status: "forbidden" }
  | { status: "ok"; context: ManagerWorkbookContext };

/** Everything a manager-only feature needs on top of the shared fetch: the freshly re-verified manager identity, the full parsed roster, and the raw manager batch snapshot to parse further sheets from. */
export interface ManagerWorkbookContext {
  manager: Person;
  people: Person[];
  snapshot: RawWorkbookSnapshot;
  /**
   * The manager's OWN presentation-only Google profile photo -- read
   * straight off the SAME `AuthIdentityResult` this function already
   * resolves for authorization (never a second/new fetch, and never
   * looked up for anyone other than the manager themselves). See
   * `lib/auth/currentUser.ts` for where it originates.
   */
  avatarUrl: string | null;
}

/**
 * The single manager-wide batch this whole app ever fetches, shared by
 * EVERY manager-only feature (Manager Overview PR #14, Manager Fairness
 * PR #15, and any future one) -- never fetched a second/third time for
 * the same request.
 */
export const MANAGER_WORKBOOK_SOURCES: SheetSourceKey[] = [
  "personnel",
  "schedule",
  "settings",
  "potentialH1",
  "potentialH2",
];

export function getManagerWorkbookSheet(snapshot: RawWorkbookSnapshot, key: SheetSourceKey): RawSheet {
  const name = SHEET_SOURCES[key];
  const sheet = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!sheet) {
    throw new Error(`Manager workbook snapshot is missing the "${name}" sheet.`);
  }
  return sheet;
}

/**
 * The shared manager-authorization + workbook-fetch boundary (PR #15 §4).
 * Extracted from PR #14's `managerOverview.ts` so BOTH Manager Overview and
 * Manager Fairness reuse the exact same security behavior instead of two
 * independent (and potentially drifting) copies of it.
 *
 * Performance follow-up (Manager category-switch latency): this used to
 * gate on `getRequestPersonalSchedule()` -- which unconditionally parses
 * schedule/settings/Potential and builds the ENTIRE `PersonalScheduleReadModel`
 * (including `detectOperationalIssues` etc.) just to read
 * `model.person.isManager` off it -- and THEN re-resolved identity and
 * re-parsed personnel a second time below anyway ("defense in depth").
 * That meant two live `getUser()` calls and two personnel parses per
 * manager request, on top of a full personal-schedule build whose result
 * was otherwise thrown away. None of that heavier work is actually
 * necessary to prove the four things a manager-only route needs:
 *
 * 1. a live authenticated Supabase user (`getRequestAuthenticatedIdentity()`
 *    -- request-scoped `cache()`-memoized, see its own docs for exactly
 *    what that does and does not share across requests; still a genuinely
 *    live, server-verified check every new request);
 * 2. that user's email resolves unambiguously against personnel
 *    (`resolveIdentityAgainstPeople`, run against a FRESH parse of the
 *    manager snapshot's own personnel sheet -- never trusted from an
 *    earlier/different fetch);
 * 3. that resolved `Person.isManager === true` (never trusted from the
 *    client, never assumed from route access alone);
 * 4. only THEN is the manager-wide batch (personnel + schedule + settings +
 *    potentialH1 + potentialH2, or the caller's own narrower `sources`)
 *    returned to the caller.
 *
 * This is still "defense in depth" in the sense that matters: identity is
 * re-verified live and personnel is freshly re-parsed from the ACTUAL
 * snapshot about to be handed to the caller, so a stale/edited record can
 * never slip through. What's gone is the SEPARATE, redundant personal-
 * schedule build that used to exist purely to ask "is this a manager" once
 * before asking it again -- an unrelated shift-schedule configuration
 * problem (which `getRequestPersonalSchedule()` used to surface here as an
 * early `configuration_error`, even for a caller like the ~17s broadcast-
 * status polls that never touch `settings` at all) can no longer block
 * this gate either; a feature that actually needs `ShiftSchedule` still
 * builds and fails closed on it itself, from `context.snapshot`, exactly
 * like `managerOverview.ts`/`permanentManagerHome.ts`/`schedule.ts`
 * already do.
 *
 * `getWorkbookSnapshot` is fetched with the CALLER's own `sources` (not a
 * fixed 5-source set) -- so a narrower caller (e.g. the broadcast/rule
 * Server Actions passing `["personnel"]`) authorizes against, and only
 * ever fetches, the sheets it actually needs; both `/manager` and
 * `/manager/fairness` still request the identical five sources, so tapping
 * between them within the cache's short TTL reuses the same snapshot
 * instead of a fresh Google request each time -- see `getWorkbookSnapshot`'s
 * own docs for why this is safe to cache (shared, non-personal data only).
 *
 * Callers that need more than the raw snapshot (e.g. Manager Overview's
 * shift schedule / date range / event parsing) do that parsing themselves
 * from `context.snapshot` via `getManagerWorkbookSheet` -- this helper
 * intentionally stops at the authorized raw snapshot + roster, since not
 * every manager feature needs the same downstream sheets.
 */
export async function loadManagerWorkbookContext(
  sources: SheetSourceKey[] = MANAGER_WORKBOOK_SOURCES,
): Promise<ManagerWorkbookContextResult> {
  return timedStage("manager.authContext", () => loadManagerWorkbookContextInner(sources));
}

async function loadManagerWorkbookContextInner(sources: SheetSourceKey[]): Promise<ManagerWorkbookContextResult> {
  const identity = await getRequestAuthenticatedIdentity();
  if (identity.status === "unauthenticated") return { status: "unauthenticated" };
  if (identity.status === "missing_email") return { status: "missing_email" };

  const snapshot = await getWorkbookSnapshot(sources);

  const people = timedSyncStage("manager.personnel.parse", () =>
    parsePersonnelSheet(getManagerWorkbookSheet(snapshot, "personnel")),
  );
  const identityResult = resolveIdentityAgainstPeople(identity, people);

  if (identityResult.status === "unmapped" || identityResult.status === "ambiguous_identity") {
    return { status: identityResult.status };
  }
  if (identityResult.status !== "ok" || !identityResult.person.isManager) {
    return { status: "forbidden" };
  }

  return {
    status: "ok",
    context: { manager: identityResult.person, people, snapshot, avatarUrl: identity.avatarUrl },
  };
}

export type ManagerPersonnelContextResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  /** Authenticated + mapped, but `person.isManager !== true`. */
  | { status: "forbidden" }
  | { status: "ok"; context: { manager: Person; people: Person[] } };

/**
 * The LIGHTWEIGHT manager-authorization boundary for background/polling
 * reads that only ever need to know "is this caller a manager" plus the
 * roster (e.g. the Manager communication area's ~17s scheduled/recent
 * broadcast status polls -- see `scheduledBroadcastActions.ts`/
 * `manualBroadcastActions.ts`). `loadManagerWorkbookContext(["personnel"])`
 * above now performs the SAME lightweight identity+personnel-only sequence
 * (its old dependency on the full Personal Schedule read model as an
 * authorization gate was removed as part of a Manager-latency pass -- see
 * that function's own docs) -- this sibling still exists, unmerged, purely
 * because its narrower return type (no `snapshot`/`avatarUrl`) matches what
 * these polling call sites actually need without them having to discard
 * fields, not because of any remaining cost difference.
 *
 * This function needs, and fetches, ONLY:
 * 1. The authenticated Supabase identity (request-scoped memoized via
 *    `getRequestAuthenticatedIdentity` -- always a live, server-verified
 *    check -- never trusts anything the client sent, and an
 *    unauthenticated/email-less caller returns immediately, before any
 *    workbook fetch or DB read of any kind).
 * 2. A personnel-ONLY workbook snapshot via `getWorkbookSnapshot`
 *    (`lib/sync`'s existing shared, short-TTL cache) -- NEVER the
 *    uncached `fetchRawWorkbookSnapshot`/`resolveCurrentPerson()` path,
 *    so a poll never forces a fresh Google request on its own; it reuses
 *    whatever `["personnel"]`-keyed snapshot any other personnel-only
 *    caller in this process recently fetched (its own canonical cache
 *    key, entirely separate from the 5-source manager/personal-schedule
 *    cache entries -- see `getWorkbookSnapshot`'s own docs).
 * 3. The EXISTING `parsePersonnelSheet` parser and the EXISTING
 *    fail-closed `resolveIdentityAgainstPeople` mapping -- no second
 *    identity-matching model, no new personnel-parsing code path.
 * 4. `person.isManager === true`, checked server-side against the
 *    freshly-resolved `Person` -- never trusted from the client, exactly
 *    like every other manager-only entry point in this codebase.
 *
 * A non-manager (or any non-"ok" identity state) fails closed to a
 * typed, non-"ok" status, same shape as `ManagerWorkbookContextResult`
 * above, before the caller's own privileged DB read (listing scheduled/
 * recent broadcasts) ever runs.
 */
export async function loadManagerPersonnelContext(): Promise<ManagerPersonnelContextResult> {
  const identity = await getRequestAuthenticatedIdentity();
  if (identity.status === "unauthenticated") return { status: "unauthenticated" };
  if (identity.status === "missing_email") return { status: "missing_email" };

  const snapshot = await getWorkbookSnapshot(["personnel"]);
  const people = parsePersonnelSheet(getManagerWorkbookSheet(snapshot, "personnel"));
  // `identity.status` is "authenticated" at this point, so
  // `resolveIdentityAgainstPeople` can only return "unmapped",
  // "ambiguous_identity", or "ok" -- never re-derive unauthenticated/
  // missing_email from it.
  const identityResult = resolveIdentityAgainstPeople(identity, people);

  if (identityResult.status === "unmapped" || identityResult.status === "ambiguous_identity") {
    return { status: identityResult.status };
  }
  if (identityResult.status !== "ok" || !identityResult.person.isManager) {
    return { status: "forbidden" };
  }

  return { status: "ok", context: { manager: identityResult.person, people } };
}
