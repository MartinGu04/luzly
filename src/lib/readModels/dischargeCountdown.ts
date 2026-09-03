import "server-only";
import { cache } from "react";
import { getRequestAuthenticatedIdentity } from "@/lib/auth/getRequestAuthenticatedIdentity";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import { SHEET_SOURCES, type RawSheet, type RawWorkbookSnapshot } from "@/lib/google";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { getWorkbookSnapshot } from "@/lib/sync";
import { jerusalemEndOfDayInstant, jerusalemStartOfDayInstant } from "@/lib/time/jerusalemClock";

export type DischargeCountdownLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "ok"; view: DischargeCountdownView };

/**
 * Everything the "עד מתי???" page needs, ready for a client component to
 * tick against -- both instants (never bare `Person.dischargeDate`/
 * `enlistmentDate` strings) so the client never has to reach for
 * `lib/time/jerusalemClock` itself (that module is `server-only`). `null`
 * fields mean "no such date on record for this person" -- a genuinely
 * empty state, never a guessed/default date.
 */
export interface DischargeCountdownView {
  personName: string;
  /** "YYYY-MM-DD", already resolved -- for the "24.01.2027"-style label. Null when כ"א has no discharge date for this person. */
  dischargeDate: string | null;
  /** The real UTC instant of 00:00:00.000 Asia/Jerusalem on `dischargeDate`, as ISO 8601. Null exactly when `dischargeDate` is null. */
  dischargeInstantIso: string | null;
  /** The real UTC instant of 23:59:59.999 Asia/Jerusalem on `dischargeDate` -- the discharge day's own last moment, so the client can treat the whole civil day as "discharge day" (DST-safe) rather than flipping straight to "post discharge" the instant midnight arrives. Null exactly when `dischargeDate` is null. */
  dischargeDayEndInstantIso: string | null;
  /** Same shape as `dischargeInstantIso`, for the enlistment date -- null when כ"א has no enlistment date for this person, independently of whether a discharge date exists. */
  enlistmentInstantIso: string | null;
}

function getPersonnelSheet(snapshot: RawWorkbookSnapshot): RawSheet {
  const name = SHEET_SOURCES.personnel;
  const sheet = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!sheet) {
    throw new Error(`Workbook snapshot is missing the "${name}" sheet.`);
  }
  return sheet;
}

/**
 * The lightweight identity boundary for "עד מתי???" -- available to EVERY
 * mapped user, not just managers (unlike `loadManagerPersonnelContext`,
 * which this otherwise mirrors: live identity + a personnel-ONLY,
 * `lib/sync`-cached snapshot + the existing fail-closed
 * `resolveIdentityAgainstPeople` mapping, no second identity-matching
 * model). Needs nothing from `schedule`/`settings`/Potential, so it never
 * fetches them.
 */
export async function loadDischargeCountdownView(): Promise<DischargeCountdownLoadResult> {
  const identity = await getRequestAuthenticatedIdentity();
  if (identity.status === "unauthenticated") return { status: "unauthenticated" };
  if (identity.status === "missing_email") return { status: "missing_email" };

  const snapshot = await getWorkbookSnapshot(["personnel"]);
  const people = parsePersonnelSheet(getPersonnelSheet(snapshot));
  const identityResult = resolveIdentityAgainstPeople(identity, people);

  if (identityResult.status === "unmapped" || identityResult.status === "ambiguous_identity") {
    return { status: identityResult.status };
  }
  if (identityResult.status !== "ok") return { status: identityResult.status };

  const { person } = identityResult;

  return {
    status: "ok",
    view: {
      personName: person.name,
      dischargeDate: person.dischargeDate,
      dischargeInstantIso: person.dischargeDate ? jerusalemStartOfDayInstant(person.dischargeDate).toISOString() : null,
      dischargeDayEndInstantIso: person.dischargeDate ? jerusalemEndOfDayInstant(person.dischargeDate).toISOString() : null,
      enlistmentInstantIso: person.enlistmentDate
        ? jerusalemStartOfDayInstant(person.enlistmentDate).toISOString()
        : null,
    },
  };
}

/** Request-scoped memoized (`cache()`), same pattern as every other per-request read model in this app -- see `getRequestPersonalSchedule`'s own docs. */
export const getRequestDischargeCountdown = cache(loadDischargeCountdownView);
