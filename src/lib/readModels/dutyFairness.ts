import "server-only";
import { resolveFairnessPeriodIdentity } from "@/lib/domain/fairnessPeriod";
import { buildPotentialDutyEventsForRoster } from "@/lib/domain/potentialDutyEvents";
import type { Event } from "@/lib/domain/event";
import type { PotentialAllocation } from "@/lib/domain/potentialAllocation";
import type { Person } from "@/lib/domain/types";
import type { SheetSourceKey } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parseFairnessTable } from "@/lib/parsers/fairness";
import { resolveHistoricalDutyPersonnel } from "@/lib/parsers/historicalDutyPersonnel";
import { parsePotentialSheet } from "@/lib/parsers/potential";
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
 *
 * `completedAllocationTotal`'s evidence is further widened, Duty-Fairness-
 * locally only, with resolved Potential-sourced duty events (see
 * `resolveConfirmedPotentialDutyEvents` below) -- for a person whose real
 * duty performance is recorded in the תקש"אס Potential sheet's operational
 * columns rather than a personal `schedule` column (e.g. a duty-only
 * participant who never works shifts).
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

  // Duty-Fairness-local evidence widening: our workbook's own convention is
  // that a name recorded in the תקש"אס Potential sheet's operational duty
  // columns (e.g. 'רס"ר 1') names the person who actually performed that
  // duty -- so for Duty Fairness specifically (never elsewhere), a resolved,
  // already-past Potential-sourced duty is valid completed-duty evidence.
  // See `resolveConfirmedPotentialDutyEvents`'s own docs for exactly which
  // existing safety conditions this still relies on unchanged.
  const potentialAllocations = parsePotentialSheet(sheet, extendedPeople);
  const confirmedPotentialDutyEvents = resolveConfirmedPotentialDutyEvents(potentialAllocations, extendedPeople, events);
  const eventsForCompletedAllocation = [...events, ...confirmedPotentialDutyEvents];

  const model = buildDutyFairnessReadModel({
    parseResult,
    periodIdentity,
    fetchedAt: snapshot.fetchedAt,
    now,
    events: eventsForCompletedAllocation,
  });

  return { status: "ok", model: withAvatars(model, avatarByPersonId), person };
}

/**
 * Widens `completedAllocationTotal`'s evidence for Duty Fairness ONLY,
 * reusing `buildPotentialDutyEventsForRoster` completely unchanged rather
 * than reimplementing any of its resolution/safety logic:
 *
 * - Person resolution (`classifyPotentialSourceOwnership`, inside
 *   `buildPotentialDutyEventsForRoster`) already fails closed -- an
 *   ambiguous or unrecognized short name (e.g. a non-unique first name)
 *   never resolves to anyone, so it never reaches this function's output
 *   at all.
 * - Duty family shape comes entirely from `parsePotentialSheet`'s own
 *   `REQUIREMENT_COLUMNS` schema -- every allocation passed in here is
 *   already one of the family shapes that parser supports; nothing new is
 *   introduced.
 * - The same-date/family/slot dedupe against real internal Events
 *   (`isAlreadyCoveredByInternalDuty`, inside `potentialDutyEvents.ts`) is
 *   untouched -- a duty already covered by a real שיבוץ is never
 *   double-produced here.
 * - The past/future cutoff is NOT decided here at all -- these events are
 *   only ever consumed via `computeCompletedDutyAllocation`, which already
 *   gates every event to `[periodStartDate, effectiveEndDate]` before it
 *   can contribute. A future Potential-sourced entry reaches this function
 *   like any other, but still contributes exactly 0, via the SAME existing
 *   cutoff every other event already goes through -- no new date logic.
 *
 * The ONLY thing this function does on top of the unchanged upstream call
 * is return brand-new `Event` objects with `certainty: "confirmed"`
 * instead of `buildPotentialDutyEvents`'s own `"tentative"` -- never
 * mutating its output, and never touching `potentialDutyEvents.ts` itself,
 * so Personal Schedule / Manager Overview / the calendar feed keep exactly
 * their existing "tentative, not yet internally confirmed" semantics.
 * `certainty` is upgraded ONLY for this Duty Fairness `events` array, which
 * itself is used for nothing except feeding `computeCompletedDutyAllocation`
 * (see `buildDutyFairnessReadModel.ts`'s own docs) -- it can never leak into
 * score/target/status, which stay entirely workbook-sourced.
 */
function resolveConfirmedPotentialDutyEvents(
  potentialAllocations: readonly PotentialAllocation[],
  people: readonly Person[],
  realEvents: readonly Event[],
): Event[] {
  return buildPotentialDutyEventsForRoster(potentialAllocations, people, realEvents).map((event) => ({
    ...event,
    certainty: "confirmed",
  }));
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
