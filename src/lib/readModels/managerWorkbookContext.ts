import "server-only";
import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import { SHEET_SOURCES, type RawSheet, type RawWorkbookSnapshot, type SheetSourceKey } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { getWorkbookSnapshot } from "@/lib/sync";
import { getRequestPersonalSchedule } from "./getRequestPersonalSchedule";

export type ManagerWorkbookContextResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "configuration_error"; message: string }
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
   * straight off the `getRequestPersonalSchedule()` call this function
   * already makes for authorization (never a second/new fetch, and never
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
 * independent (and potentially drifting) copies of it:
 *
 * 1. Reuses `getRequestPersonalSchedule()` (request-scoped, shared with the
 *    protected layout) as the FIRST authorization gate -- every existing
 *    auth/config state passes through unchanged, and a non-manager never
 *    triggers the manager-only fetch below at all.
 * 2. Only once that result is "ok" AND `model.person.isManager === true`
 *    does this fetch the manager-wide batch (personnel + schedule +
 *    settings + potentialH1 + potentialH2) -- via `getWorkbookSnapshot`
 *    (`lib/sync`), never performed for a normal user or a non-manager
 *    hitting a manager-only route. Both `/manager` and `/manager/fairness`
 *    request the exact same five sources, so a manager tapping between
 *    them within the cache's short TTL reuses the same snapshot instead
 *    of a fresh Google request each time -- see `getWorkbookSnapshot`'s
 *    own docs for why this is safe to cache (shared, non-personal data
 *    only) and how it stays isolated from the personal 3-source set.
 * 3. Defense in depth: re-resolves the authenticated identity (a live
 *    Supabase call, NEVER cached) against the (possibly cache-reused)
 *    manager snapshot's own freshly-parsed personnel sheet, and re-checks
 *    `isManager` there too. If that second check fails for any reason
 *    (personnel changed since that snapshot was fetched, a stale/edited
 *    record, anything), this fails closed as "forbidden" -- the already-
 *    fetched manager data is discarded, never returned to a caller. The
 *    cache's short TTL bounds how old "since that snapshot was fetched"
 *    can be -- this check is still genuinely re-run every single request,
 *    just possibly against data up to `SNAPSHOT_CACHE_REVALIDATE_SECONDS`
 *    old rather than an instantaneous read, the same explicit tradeoff
 *    the cache makes everywhere else.
 *
 * Callers that need more than the raw snapshot (e.g. Manager Overview's
 * shift schedule / date range / event parsing) do that parsing themselves
 * from `context.snapshot` via `getManagerWorkbookSheet` -- this helper
 * intentionally stops at the authorized raw snapshot + roster, since not
 * every manager feature needs the same downstream sheets.
 *
 * `sources` defaults to `MANAGER_WORKBOOK_SOURCES` (every existing caller's
 * behavior, unchanged) but a narrower feature -- e.g. Schedule (PR #24),
 * which never needs potentialH1/H2 -- can pass its own smaller list so it
 * never fetches sheets it has no use for, while still going through the
 * exact same fail-closed authorization sequence.
 */
export async function loadManagerWorkbookContext(
  sources: SheetSourceKey[] = MANAGER_WORKBOOK_SOURCES,
): Promise<ManagerWorkbookContextResult> {
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

  const snapshot = await getWorkbookSnapshot(sources);

  // Defense in depth: re-verify identity + manager status against the FRESH snapshot, never trust the first check alone.
  const identity = await getAuthenticatedIdentity();
  const people = parsePersonnelSheet(getManagerWorkbookSheet(snapshot, "personnel"));
  const identityResult = resolveIdentityAgainstPeople(identity, people);

  if (identityResult.status !== "ok" || !identityResult.person.isManager) {
    return { status: "forbidden" };
  }

  return {
    status: "ok",
    context: { manager: identityResult.person, people, snapshot, avatarUrl: personalResult.avatarUrl },
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
 * `manualBroadcastActions.ts`). Deliberately NOT `loadManagerWorkbookContext`
 * above: that helper's FIRST step is `getRequestPersonalSchedule()`, which
 * unconditionally loads and parses the full Personal Schedule read model
 * (personnel + schedule + settings + both Potential periods, including
 * building a `ShiftSchedule` that can itself fail closed as a
 * `configuration_error`) purely as its authorization gate, before this
 * function's caller's actual `sources` parameter is even consulted. That
 * is the right authorization path for an actual Personal Schedule/Manager
 * read-model request, but it is the WRONG one for a lightweight status
 * poll that only ever needs the roster -- repeating that full parse every
 * ~17 seconds does real CPU work on every poll (the 30-second workbook
 * cache only saves the Google round trip, not the parsing), and
 * needlessly couples an unrelated feature's polling to Schedule/Settings/
 * Potential health.
 *
 * This function needs, and fetches, ONLY:
 * 1. The authenticated Supabase identity (`getAuthenticatedIdentity`,
 *    always a live, server-verified check -- never trusts anything the
 *    client sent, and an unauthenticated/email-less caller returns
 *    immediately, before any workbook fetch or DB read of any kind).
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
  const identity = await getAuthenticatedIdentity();
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
