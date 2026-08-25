import "server-only";
import { classifyPersonnelType } from "@/lib/domain/personnelType";
import type { Person } from "@/lib/domain/types";
import type { SheetSourceKey } from "@/lib/google";
import { parseShootingRangesSheet } from "@/lib/parsers/shootingRanges";
import { getManagerWorkbookSheet, loadManagerWorkbookContext } from "@/lib/readModels/managerWorkbookContext";
import { getCompletionsForPersonIds, getPlannedOccurrencesForPersonIds } from "@/lib/shootingRanges/store";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import {
  buildShootingRangeManagerReadModel,
  type ShootingRangeManagerReadModel,
} from "./buildShootingRangeManagerReadModel";
import { buildShootingRangeQualificationReadModel } from "./buildShootingRangeQualificationReadModel";
import { selectSheetBaselineForPerson } from "./shootingRangeQualification";

const SHOOTING_RANGES_MANAGER_SOURCES: SheetSourceKey[] = ["personnel", "shootingRanges"];

export type ShootingRangeManagerOverviewLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "forbidden" }
  | { status: "ok"; manager: Person; model: ShootingRangeManagerReadModel; avatarUrl: string | null };

/**
 * Server-only orchestration for the manager-only team מטווחים overview.
 * Reuses `loadManagerWorkbookContext` (the SAME manager-authorization
 * boundary `/manager` and `/manager/fairness` already use) narrowed to
 * only the two sources this feature needs (`personnel` + `shootingRanges`)
 * -- never the full 5-source manager set, and never a second/parallel
 * manager-authorization check.
 *
 * For every current roster person, builds their own
 * `ShootingRangeQualificationReadModel` via the EXACT SAME pure builder
 * the personal page uses (never a second qualification computation), then
 * aggregates with `buildShootingRangeManagerReadModel`.
 */
export async function loadShootingRangeManagerOverview(): Promise<ShootingRangeManagerOverviewLoadResult> {
  const contextResult = await loadManagerWorkbookContext(SHOOTING_RANGES_MANAGER_SOURCES);
  if (contextResult.status !== "ok") return contextResult;

  const { manager, people, snapshot, avatarUrl } = contextResult.context;
  // Name resolution (`parseShootingRangesSheet`'s fail-closed ambiguity
  // check) is run against the FULL roster, never a pre-filtered subset --
  // a name that's ambiguous against permanent/reserve personnel too must
  // still fail closed, even though this feature is scoped to regular
  // personnel only below. Filtering before resolution could silently turn
  // a genuinely ambiguous name into a falsely-unique match.
  const sheetRecords = parseShootingRangesSheet(getManagerWorkbookSheet(snapshot, "shootingRanges"), people);
  const now = getJerusalemLocalNow();

  // מטווחים is scoped to regular-service (חובה) personnel only (product
  // decision) -- permanent (קבע) and reserve (מילואים) personnel are
  // entirely excluded from the overview: not in `rows`, not counted in
  // `summary`, not in `pendingSelfReports`, and never fetched from the
  // app-owned tables below at all.
  const eligiblePeople = people.filter((person) => classifyPersonnelType(person.personnelType) === "regular");

  const personIds = eligiblePeople.map((person) => person.id);
  const [allCompletions, allPlannedOccurrences] = await Promise.all([
    getCompletionsForPersonIds(personIds),
    getPlannedOccurrencesForPersonIds(personIds),
  ]);

  const completionsByPerson = groupBy(allCompletions, (row) => row.personId);
  const plannedByPerson = groupBy(allPlannedOccurrences, (row) => row.personId);

  const perPersonModels = eligiblePeople.map((person) => ({
    personId: person.id,
    personName: person.name,
    model: buildShootingRangeQualificationReadModel({
      personId: person.id,
      sheetBaseline: selectSheetBaselineForPerson(sheetRecords, person.id, now.date),
      completions: completionsByPerson.get(person.id) ?? [],
      plannedOccurrences: plannedByPerson.get(person.id) ?? [],
      today: now.date,
    }),
  }));

  const model = buildShootingRangeManagerReadModel(perPersonModels);
  return { status: "ok", manager, model, avatarUrl };
}

function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = map.get(key);
    if (group) group.push(item);
    else map.set(key, [item]);
  }
  return map;
}
