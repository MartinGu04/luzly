import "server-only";
import { resolveFairnessPeriodIdentity } from "@/lib/domain/fairnessPeriod";
import type { Person } from "@/lib/domain/types";
import type { SheetSourceKey } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parseFairnessTable } from "@/lib/parsers/fairness";
import { resolveHistoricalDutyPersonnel } from "@/lib/parsers/historicalDutyPersonnel";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildDutyFairnessReadModel } from "./buildDutyFairnessReadModel";
import type { DutyFairnessGroupView, DutyFairnessReadModel } from "./dutyFairnessTypes";
import { getFairnessWorkbookSheet, loadFairnessWorkbookContext } from "./fairnessWorkbookContext";

export type DutyFairnessLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "ok"; model: DutyFairnessReadModel; person: Person };

const PERIOD_SHEET_KEYS: Record<"h1" | "h2", SheetSourceKey> = {
  h1: "potentialH1",
  h2: "potentialH2",
};

/**
 * Server-only orchestration for the standalone Fairness experience's Duty
 * mode. Authorization + workbook fetch is `loadFairnessWorkbookContext()`
 * (non-manager-only, PR #4, the SAME context Shift mode uses) -- this file
 * only does what's specific to Duty Fairness: resolving the requested
 * H1/H2 period identity (same convention `managerFairness.ts` already
 * established -- an invalid/missing `?period=` falls back to the period
 * containing `now`), structurally parsing that ONE period's Fairness table
 * via the existing, unchanged `parseFairnessTable`, and delegating every
 * actual analysis to `buildDutyFairnessReadModel` UNCHANGED. Duty Fairness
 * stays H1/H2 -- never converted to calendar months.
 *
 * Also parses the `schedule` sheet into real `Event`s (the SAME sheet/
 * parse call `shiftFairness.ts` already makes) purely to feed each row's
 * weighted `completedAllocationTotal` -- `FAIRNESS_WORKBOOK_SOURCES` already
 * includes `schedule` for both Fairness modes, so this is no extra Google
 * fetch. Never used for anything score/target/status-related, which stay entirely
 * workbook-sourced.
 */
export async function loadDutyFairnessReadModel(rawPeriod: string | null): Promise<DutyFairnessLoadResult> {
  const contextResult = await loadFairnessWorkbookContext();
  if (contextResult.status !== "ok") return contextResult;

  const { person, people, snapshot, avatarByPersonId } = contextResult.context;

  const now = getJerusalemLocalNow();
  const periodIdentity = resolveFairnessPeriodIdentity(rawPeriod, now);

  const sheet = getFairnessWorkbookSheet(snapshot, PERIOD_SHEET_KEYS[periodIdentity.key]);
  const scheduleSheet = getFairnessWorkbookSheet(snapshot, "schedule");

  // First pass with the current roster only, to find Fairness-table rows
  // that don't resolve against anyone currently in כ"א -- candidates for a
  // former employee with real historical duty evidence (see
  // lib/parsers/historicalDutyPersonnel.ts). `people` itself, and every
  // other read model sharing loadFairnessWorkbookContext(), never see the
  // extended list built below -- this stays local to Duty Fairness.
  const firstPassResult = parseFairnessTable(sheet, people);
  const unresolvedNames = firstPassResult.personRows
    .filter((row) => row.resolvedPersonId === null)
    .map((row) => row.sourceName);

  const historicalPeople = resolveHistoricalDutyPersonnel(scheduleSheet, people, unresolvedNames);
  const extendedPeople = historicalPeople.length > 0 ? [...people, ...historicalPeople] : people;

  const parseResult = extendedPeople === people ? firstPassResult : parseFairnessTable(sheet, extendedPeople);

  const rawAssignments = parseScheduleSheet(scheduleSheet, extendedPeople);
  const events = rawAssignments.map(parseEvent);

  const model = buildDutyFairnessReadModel({ parseResult, periodIdentity, fetchedAt: snapshot.fetchedAt, now, events });

  return { status: "ok", model: withAvatars(model, avatarByPersonId), person };
}

/**
 * Stamps `avatarUrl` onto every row of an already-built
 * `DutyFairnessReadModel`, purely a presentation enrichment -- never
 * touches `buildDutyFairnessReadModel`'s own calculation/sorting/
 * eligibility logic, which this runs strictly AFTER. A row with
 * `personId === null` (unresolved source name) always gets `avatarUrl:
 * null` -- there is no person to look a photo up for.
 */
function withAvatars(
  model: DutyFairnessReadModel,
  avatarByPersonId: ReadonlyMap<string, string | null>,
): DutyFairnessReadModel {
  const groups: DutyFairnessGroupView[] = model.groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({
      ...row,
      avatarUrl: row.personId !== null ? (avatarByPersonId.get(row.personId) ?? null) : null,
    })),
  }));
  return { ...model, groups };
}
