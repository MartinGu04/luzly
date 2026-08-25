import "server-only";
import { getRequestAuthenticatedIdentity } from "@/lib/auth/getRequestAuthenticatedIdentity";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import { isEligibleForShootingRanges } from "@/lib/domain/shootingRangeQualification";
import type { Person } from "@/lib/domain/types";
import { SHEET_SOURCES, type RawWorkbookSnapshot, type SheetSourceKey } from "@/lib/google";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { parseShootingRangesSheet, type ShootingRangeSheetRecord } from "@/lib/parsers/shootingRanges";
import { getCompletionsForPersonIds, getPlannedOccurrencesForPersonIds } from "@/lib/shootingRanges/store";
import { getWorkbookSnapshot } from "@/lib/sync";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import {
  buildShootingRangeQualificationReadModel,
  type ShootingRangeQualificationReadModel,
} from "./buildShootingRangeQualificationReadModel";

export const SHOOTING_RANGES_REQUIRED_SOURCES: SheetSourceKey[] = ["personnel", "shootingRanges"];

export type ShootingRangeQualificationLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  /**
   * Authenticated + uniquely mapped, but `!isEligibleForShootingRanges(person)`
   * -- מטווחים is scoped to regular-service (חובה) personnel who are also
   * אחמ"ש or טכנאי (product decision); everyone else (permanent, reserve,
   * or a regular person in neither role) is entirely out of scope, not
   * merely hidden from the UI. No model is ever built for this caller.
   * `person`/`avatarUrl` are still carried (same shape as "ok") so the page
   * can still render identity chrome and the manager-overview link for a
   * non-eligible MANAGER (e.g. a קבע person overseeing regular personnel is
   * a real case -- their own personal ineligibility must never hide their
   * access to the team overview).
   */
  | { status: "not_applicable"; person: Person; avatarUrl: string | null }
  | { status: "ok"; person: Person; model: ShootingRangeQualificationReadModel; avatarUrl: string | null };

function getSheet(snapshot: RawWorkbookSnapshot, key: SheetSourceKey) {
  const name = SHEET_SOURCES[key];
  const sheet = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!sheet) throw new Error(`Workbook snapshot is missing the "${name}" sheet.`);
  return sheet;
}

/**
 * The most recent "מטווחים" sheet row for `personId` whose `performedOn` is
 * today or earlier -- a genuinely past/current completion, eligible as the
 * Google Sheet initial baseline. A row whose `performedOn` is in the
 * FUTURE is never returned here (it is a planned occurrence's concern
 * instead, and today has no automatic data source feeding one from this
 * sheet -- see `lib/shootingRanges/README.md`). Ties (two past rows on the
 * same date, or same performedOn) resolve to the LATEST `performedOn`,
 * consistent with "the authoritative field is תאריך ביצוע מטווח" -- never
 * an arbitrary sheet-row-order pick.
 */
export function selectSheetBaselineForPerson(
  records: readonly ShootingRangeSheetRecord[],
  personId: string,
  today: string,
): ShootingRangeSheetRecord | null {
  const candidates = records.filter((record) => record.resolvedPersonId === personId && record.performedOn <= today);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, candidate) => (candidate.performedOn > latest.performedOn ? candidate : latest));
}

/**
 * Server-only orchestration for the authenticated person's own מטווחים
 * qualification read model:
 *
 * 1. Resolves the Supabase identity + personnel via the SAME fail-closed
 *    `resolveIdentityAgainstPeople` every other personal read model uses.
 * 2. Fetches personnel + "מטווחים" via `lib/sync`'s cached
 *    `getWorkbookSnapshot` -- never a second/duplicate Google source.
 * 3. Gates on `isEligibleForShootingRanges(person)` -- מטווחים applies only
 *    to regular-service (חובה) personnel who are also אחמ"ש or טכנאי
 *    (product decision); anyone else gets `{status: "not_applicable"}`
 *    before the sheet is even parsed.
 * 4. Parses the sheet with `parseShootingRangesSheet` and narrows it to
 *    this person's own most recent past-dated row (`selectSheetBaselineForPerson`).
 * 5. Reads this person's own completion history + planned occurrences from
 *    `lib/shootingRanges/store.ts` (the app-owned tables).
 * 6. Delegates all business logic to the pure, independently testable
 *    `buildShootingRangeQualificationReadModel` -- this function does no
 *    precedence/date-math decisions of its own.
 */
export async function loadShootingRangeQualification(): Promise<ShootingRangeQualificationLoadResult> {
  const identity = await getRequestAuthenticatedIdentity();
  if (identity.status === "unauthenticated") return { status: "unauthenticated" };
  if (identity.status === "missing_email") return { status: "missing_email" };

  const snapshot = await getWorkbookSnapshot(SHOOTING_RANGES_REQUIRED_SOURCES);
  const people = parsePersonnelSheet(getSheet(snapshot, "personnel"));
  const identityResult = resolveIdentityAgainstPeople(identity, people);
  if (identityResult.status !== "ok") return identityResult;

  const person = identityResult.person;
  if (!isEligibleForShootingRanges(person)) {
    return { status: "not_applicable", person, avatarUrl: identity.avatarUrl };
  }

  const sheetRecords = parseShootingRangesSheet(getSheet(snapshot, "shootingRanges"), people);
  const now = getJerusalemLocalNow();

  const [completions, plannedOccurrences] = await Promise.all([
    getCompletionsForPersonIds([person.id]),
    getPlannedOccurrencesForPersonIds([person.id]),
  ]);

  const model = buildShootingRangeQualificationReadModel({
    personId: person.id,
    sheetBaseline: selectSheetBaselineForPerson(sheetRecords, person.id, now.date),
    completions,
    plannedOccurrences,
    today: now.date,
  });

  return { status: "ok", person, model, avatarUrl: identity.avatarUrl };
}
