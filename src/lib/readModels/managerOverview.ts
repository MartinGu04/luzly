import "server-only";
import { resolveManagerDateRange } from "@/lib/domain/dateRange";
import { deriveReserveRoleParticipation, type ReserveRoleParticipationSource } from "@/lib/domain/reserveParticipation";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { parseSourcePeriodYear, type RawSheet } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parseFairnessTable } from "@/lib/parsers/fairness";
import { parsePotentialSheet } from "@/lib/parsers/potential";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildManagerOverviewReadModel } from "./buildManagerOverviewReadModel";
import { getManagerWorkbookSheet, loadManagerWorkbookContext } from "./managerWorkbookContext";
import type { ManagerOverviewParams } from "./managerOverviewParams";
import type { ManagerOverviewReadModel } from "./managerTypes";

export type ManagerOverviewLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "configuration_error"; message: string }
  /** Authenticated + mapped, but `person.isManager !== true` -- no manager-wide fetch was ever performed. */
  | { status: "forbidden" }
  | { status: "ok"; model: ManagerOverviewReadModel };

/**
 * Server-only orchestration for `ManagerOverviewReadModel`. The
 * authorization + manager-wide fetch boundary itself lives in
 * `managerWorkbookContext.ts` (shared with Manager Fairness, PR #15 §4) --
 * this file only does what's specific to the overview: parsing
 * schedule/settings/Potential from the authorized snapshot, building the
 * shift schedule, resolving the requested date range, and building
 * `ManagerOverviewReadModel`.
 */
export async function loadManagerOverviewReadModel(
  params: ManagerOverviewParams,
): Promise<ManagerOverviewLoadResult> {
  const contextResult = await loadManagerWorkbookContext();
  if (contextResult.status !== "ok") return contextResult;

  const { manager, people, snapshot } = contextResult.context;

  const settings = parseSettingsSheet(getManagerWorkbookSheet(snapshot, "settings"));

  let shiftSchedule: ShiftSchedule;
  try {
    shiftSchedule = buildShiftSchedule(settings.shiftStartTimeDay);
  } catch (error) {
    if (error instanceof ShiftConfigurationError) {
      return { status: "configuration_error", message: error.message };
    }
    throw error;
  }

  const rawAssignments = parseScheduleSheet(getManagerWorkbookSheet(snapshot, "schedule"), people);
  const events = rawAssignments.map(parseEvent);

  const potentialAllocations = [
    ...parsePotentialSheet(getManagerWorkbookSheet(snapshot, "potentialH1"), people),
    ...parsePotentialSheet(getManagerWorkbookSheet(snapshot, "potentialH2"), people),
  ];

  // PR #39 -- the SAME two Potential sheets, already in this manager batch
  // (no extra Google fetch), also each carry a separate "טבלת צדק"
  // Fairness table (PR #15's `parseFairnessTable`) whose current allocation
  // is the reservist shift-coverage-recommendation participation evidence.
  // Only `resolvedPersonId`/`allocationLabel` ever reach
  // `deriveReserveRoleParticipation` -- scores/exemptions/source cells never
  // leave this Fairness-table parse. Each side is also tagged with the real
  // YEAR its own source tab name represents (`parseSourcePeriodYear`,
  // structurally parsed from e.g. "...1-6/2026" -- never hardcoded) so a
  // future issue from a different year can never silently reuse this
  // year's evidence just because it resolves to the same h1/h2 half
  // (`resolveReserveRoleParticipation` is where that year check happens).
  const reserveParticipationByPeriod = {
    h1: reserveParticipationSource(getManagerWorkbookSheet(snapshot, "potentialH1"), people),
    h2: reserveParticipationSource(getManagerWorkbookSheet(snapshot, "potentialH2"), people),
  };

  const now = getJerusalemLocalNow();
  const range = resolveManagerDateRange(params.range, params.month, now);

  const model = buildManagerOverviewReadModel({
    manager,
    people,
    events,
    potentialAllocations,
    reserveParticipationByPeriod,
    shiftSchedule,
    fetchedAt: snapshot.fetchedAt,
    now,
    range,
    selectedPersonId: params.personId,
    problemsOnly: params.problemsOnly,
  });

  return { status: "ok", model };
}

/**
 * One period's `ReserveRoleParticipationSource` -- the Fairness table's
 * participation evidence, tagged with the year that sheet's OWN name
 * (`SHEET_SOURCES.potentialH1`/`potentialH2` via `getManagerWorkbookSheet`,
 * never hardcoded) actually represents. `sheet.name` is exactly the
 * already-fetched `RawSheet`'s real tab name -- reusing it here means the
 * year comes from the SAME snapshot already in hand, not a second lookup.
 */
function reserveParticipationSource(sheet: RawSheet, people: readonly Person[]): ReserveRoleParticipationSource {
  return {
    year: parseSourcePeriodYear(sheet.name),
    participation: deriveReserveRoleParticipation(parseFairnessTable(sheet, people).personRows),
  };
}
