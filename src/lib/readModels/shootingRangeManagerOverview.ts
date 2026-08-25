import "server-only";
import { isEligibleForShootingRanges } from "@/lib/domain/shootingRangeQualification";
import type { Person } from "@/lib/domain/types";
import type { SheetSourceKey } from "@/lib/google";
import { parseShootingRangeRelevanceSheet, parseShootingRangesSheet } from "@/lib/parsers/shootingRanges";
import { fetchEmailToAvatarUrl, resolveAvatarUrlsByPersonId } from "@/lib/readModels/personAvatarLookup";
import { getManagerWorkbookSheet, loadManagerWorkbookContext } from "@/lib/readModels/managerWorkbookContext";
import { getCompletionsForPersonIds, getPlannedOccurrencesForPersonIds } from "@/lib/shootingRanges/store";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import {
  buildShootingRangeManagerReadModel,
  type ShootingRangeManagerReadModel,
} from "./buildShootingRangeManagerReadModel";
import { buildShootingRangeQualificationReadModel } from "./buildShootingRangeQualificationReadModel";
import { selectRelevanceRecordForPerson, selectSheetBaselineForPerson } from "./shootingRangeQualification";

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
  // Started now, concurrently with the manager workbook fetch below -- it
  // depends on no roster/identity data (see `personAvatarLookup.ts`'s own
  // docs), so there's no reason to wait for either to resolve first.
  // Caught here (never left to reject into the `await` below) so a
  // Supabase Admin API hiccup degrades to "nobody has a known photo yet"
  // rather than failing the whole manager panel.
  const emailToAvatarUrlPromise = fetchEmailToAvatarUrl().catch(() => {
    console.error("[shooting-ranges] roster avatar lookup failed");
    return new Map<string, string | null>();
  });

  const contextResult = await loadManagerWorkbookContext(SHOOTING_RANGES_MANAGER_SOURCES);
  if (contextResult.status !== "ok") return contextResult;

  const { manager, people, snapshot, avatarUrl } = contextResult.context;
  // Name resolution (`parseShootingRangesSheet`'s fail-closed ambiguity
  // check) is run against the FULL roster, never a pre-filtered subset --
  // a name that's ambiguous against permanent/reserve personnel too must
  // still fail closed, even though this feature is scoped to regular
  // personnel only below. Filtering before resolution could silently turn
  // a genuinely ambiguous name into a falsely-unique match.
  const shootingRangesSheet = getManagerWorkbookSheet(snapshot, "shootingRanges");
  const sheetRecords = parseShootingRangesSheet(shootingRangesSheet, people);
  const relevanceRecords = parseShootingRangeRelevanceSheet(shootingRangesSheet, people);
  const now = getJerusalemLocalNow();

  // מטווחים is scoped to regular-service (חובה) personnel who are also
  // אחמ"ש or טכנאי (product decision) -- everyone else is entirely
  // excluded from the overview: not in `rows`, not counted in `summary`,
  // not in `pendingSelfReports`, and never fetched from the app-owned
  // tables below at all. A eligible person marked `לא רלוונטי` on the
  // sheet DOES still appear here (spec: "remains visible in their correct
  // אחמ"ש/טכנאי group") -- only role/service scope excludes someone from
  // the roster entirely; relevance only changes how an included person's
  // row is classified (see `buildShootingRangeManagerReadModel`).
  const eligiblePeople = people.filter((person) => isEligibleForShootingRanges(person));

  const avatarByPersonId = resolveAvatarUrlsByPersonId(eligiblePeople, await emailToAvatarUrlPromise);

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
    isSupervisor: person.isSupervisor,
    isTechnician: person.isTechnician,
    avatarUrl: avatarByPersonId.get(person.id) ?? null,
    model: buildShootingRangeQualificationReadModel({
      personId: person.id,
      sheetBaseline: selectSheetBaselineForPerson(sheetRecords, person.id, now.date),
      sheetRelevance: selectRelevanceRecordForPerson(relevanceRecords, person.id),
      completions: completionsByPerson.get(person.id) ?? [],
      plannedOccurrences: plannedByPerson.get(person.id) ?? [],
      today: now.date,
    }),
  }));

  // Diagnostic visibility (spec: "surface parser/data issues rather than
  // guessing"): a "מטווחים" row that never resolved to exactly one
  // personnel record (a name mismatch between this sheet and כ"א, or a
  // genuine ambiguity) is silently EXCLUDED from every baseline
  // computation above -- by design, since fabricating an assignment would
  // risk attributing someone else's completion. But silently dropping it
  // with no visible trace anywhere is its own failure mode: a manager
  // staring at "אין מידע כשירות" for someone they know completed a range
  // has no way to tell "no data" apart from "data exists but couldn't be
  // matched". The RAW `sourceName` text (never trimmed/normalized) is
  // carried through so a manager can visually compare it against כ"א
  // themselves -- see `buildShootingRangeManagerReadModel`'s own docs.
  const unresolvedSheetRows = sheetRecords.filter((record) => record.resolvedPersonId === null);
  const unresolvedSheetRowNames = unresolvedSheetRows.map((record) => record.sourceName);

  const model = buildShootingRangeManagerReadModel(perPersonModels, unresolvedSheetRows.length, unresolvedSheetRowNames);
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
