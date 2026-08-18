import "server-only";
import {
  calendarMonthOfLocalNow,
  formatMonthParam,
  parseMonthParam,
  type CalendarMonthKey,
} from "@/lib/domain/calendarMonth";
import { resolveFairnessPeriodIdentity } from "@/lib/domain/fairnessPeriod";
import {
  deriveReserveRoleParticipation,
  resolveReserveRoleParticipation,
  type ReserveRoleParticipationSource,
} from "@/lib/domain/reserveParticipation";
import type { Person } from "@/lib/domain/types";
import { parseSourcePeriodYear, type RawSheet } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parseFairnessTable } from "@/lib/parsers/fairness";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildShiftFairnessReadModel } from "./buildShiftFairnessReadModel";
import { getFairnessWorkbookSheet, loadFairnessWorkbookContext } from "./fairnessWorkbookContext";
import type { ShiftFairnessReadModel } from "./shiftFairnessTypes";

export type ShiftFairnessLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "ok"; model: ShiftFairnessReadModel; person: Person };

/** Same convention as `managerOverview.ts`'s own `reserveParticipationSource` -- one Potential sheet's Fairness-table participation evidence, tagged with the real year its own tab name represents. */
function reserveParticipationSource(sheet: RawSheet, people: readonly Person[]): ReserveRoleParticipationSource {
  return {
    year: parseSourcePeriodYear(sheet.name),
    participation: deriveReserveRoleParticipation(parseFairnessTable(sheet, people).personRows),
  };
}

/**
 * Server-only orchestration for the standalone Fairness experience's Shift
 * mode. Authorization + workbook fetch is `loadFairnessWorkbookContext()`
 * (non-manager-only, PR #4) -- this file only does what's specific to
 * Shift Fairness: parsing confirmed Events from the schedule sheet,
 * resolving the requested month (falling back to the current Jerusalem-
 * local month for a missing/invalid one), resolving which H1/H2 period
 * that month falls in for `reserveParticipation` (closed-period
 * modelability -- see `fairnessShiftEngine.ts`'s own docs), and delegating
 * every actual calculation to `buildShiftFairnessReadModel` UNCHANGED.
 * Never reproduces the shift engine here.
 */
export async function loadShiftFairnessReadModel(rawMonth: string | null): Promise<ShiftFairnessLoadResult> {
  const contextResult = await loadFairnessWorkbookContext();
  if (contextResult.status !== "ok") return contextResult;

  const { person, people, snapshot } = contextResult.context;

  const now = getJerusalemLocalNow();
  const month: CalendarMonthKey = parseMonthParam(rawMonth) ?? calendarMonthOfLocalNow(now);

  const rawAssignments = parseScheduleSheet(getFairnessWorkbookSheet(snapshot, "schedule"), people);
  const events = rawAssignments.map(parseEvent);

  // Which H1/H2 period the REQUESTED month falls in -- never "now" -- so a
  // past/future month still resolves against the Fairness-table evidence
  // that actually covers it (same convention `managerOverview.ts`'s own
  // shift-coverage recommendation uses per-issue-date).
  const monthAsDate = `${formatMonthParam(month)}-01`;
  const periodIdentity = resolveFairnessPeriodIdentity(null, { date: monthAsDate, minuteOfDay: 0 });
  const reserveParticipationByPeriod = {
    h1: reserveParticipationSource(getFairnessWorkbookSheet(snapshot, "potentialH1"), people),
    h2: reserveParticipationSource(getFairnessWorkbookSheet(snapshot, "potentialH2"), people),
  };
  const reserveParticipation = resolveReserveRoleParticipation(reserveParticipationByPeriod, periodIdentity);

  const model = buildShiftFairnessReadModel(people, events, month, now, snapshot.fetchedAt, reserveParticipation);

  return { status: "ok", model, person };
}
