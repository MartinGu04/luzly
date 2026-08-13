import "server-only";
import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import {
  fetchRawWorkbookSnapshot,
  SHEET_SOURCES,
  type RawSheet,
  type RawWorkbookSnapshot,
  type SheetSourceKey,
} from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
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
 *    settings + potentialH1 + potentialH2) -- ONE additional Google
 *    request, never performed for a normal user or a non-manager hitting
 *    a manager-only route. Both `/manager` and `/manager/fairness` request
 *    the exact same five sources, so neither feature ever adds a second or
 *    third Google fetch on top of this one.
 * 3. Defense in depth: re-resolves the authenticated identity against the
 *    FRESH manager snapshot's own freshly-parsed personnel sheet, and
 *    re-checks `isManager` there too. If that second check fails for any
 *    reason (personnel changed between the two fetches, a stale/edited
 *    record, anything), this fails closed as "forbidden" -- the already-
 *    fetched manager data is discarded, never returned to a caller.
 *
 * Callers that need more than the raw snapshot (e.g. Manager Overview's
 * shift schedule / date range / event parsing) do that parsing themselves
 * from `context.snapshot` via `getManagerWorkbookSheet` -- this helper
 * intentionally stops at the authorized raw snapshot + roster, since not
 * every manager feature needs the same downstream sheets.
 */
export async function loadManagerWorkbookContext(): Promise<ManagerWorkbookContextResult> {
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

  const snapshot = await fetchRawWorkbookSnapshot(MANAGER_WORKBOOK_SOURCES);

  // Defense in depth: re-verify identity + manager status against the FRESH snapshot, never trust the first check alone.
  const identity = await getAuthenticatedIdentity();
  const people = parsePersonnelSheet(getManagerWorkbookSheet(snapshot, "personnel"));
  const identityResult = resolveIdentityAgainstPeople(identity, people);

  if (identityResult.status !== "ok" || !identityResult.person.isManager) {
    return { status: "forbidden" };
  }

  return { status: "ok", context: { manager: identityResult.person, people, snapshot } };
}
