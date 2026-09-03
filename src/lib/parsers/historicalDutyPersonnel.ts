import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { findScheduleColumnHeaderTexts } from "./schedule";
import { stableIdFromName } from "./personnel";

function normalizeName(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Mints a stand-in `Person` for someone who has left the current כ"א
 * roster but still has real historical Duty Fairness evidence (e.g. a
 * technician who transferred departments mid-period) -- so their already
 * completed duties keep showing up in the historical period they actually
 * happened in, without re-adding them to current personnel.
 *
 * Deliberately conservative: a name is only minted when BOTH signals
 * independently exist in real, already-fetched sheet data --
 *   1. it heads a real schedule ("משמרות + תורנויות") person-zone column
 *      (real duty evidence), and
 *   2. it's a real unresolved Fairness-table row's `sourceName` (real
 *      historical-period attribution) --
 * and it does NOT match anyone already in the current roster (never
 * shadows/duplicates a current Person). No fuzzy matching -- exact
 * whitespace-normalized equality only, same convention as every other
 * name comparison in this codebase.
 *
 * The returned `Person`s reuse `stableIdFromName` so the id is identical
 * to what they'd get if re-added to כ"א later, but every eligibility flag
 * is hard-`false`/`null` -- callers must only use these for historical
 * attribution, never for current eligibility, recommendations, shifts, or
 * notifications. This function itself has no callers outside
 * `lib/readModels/dutyFairness.ts`, and its output must never be merged
 * into the shared `people` roster returned by
 * `loadFairnessWorkbookContext`.
 */
export function resolveHistoricalDutyPersonnel(
  scheduleSheet: RawSheet,
  currentPeople: readonly Person[],
  unresolvedFairnessNames: readonly string[],
): Person[] {
  const currentNames = new Set(currentPeople.map((person) => normalizeName(person.name)));
  const unresolvedNames = new Set(unresolvedFairnessNames.map(normalizeName));

  const historicalPeople: Person[] = [];
  const seen = new Set<string>();

  for (const headerText of findScheduleColumnHeaderTexts(scheduleSheet)) {
    const normalized = normalizeName(headerText);
    if (seen.has(normalized)) continue;
    if (currentNames.has(normalized)) continue;
    if (!unresolvedNames.has(normalized)) continue;

    seen.add(normalized);
    historicalPeople.push({
      id: stableIdFromName(headerText),
      name: headerText,
      email: null,
      isManager: false,
      isTechnician: false,
      isSupervisor: false,
      personnelType: null,
      dischargeDate: null,
      enlistmentDate: null,
    });
  }

  return historicalPeople;
}
