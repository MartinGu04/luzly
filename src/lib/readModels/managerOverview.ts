import "server-only";
import { resolveManagerDateRange } from "@/lib/domain/dateRange";
import { deriveReserveRoleParticipation, type ReserveRoleParticipationSource } from "@/lib/domain/reserveParticipation";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { parseSourcePeriodYear, type RawSheet } from "@/lib/google";
import { computeNotificationReadiness } from "@/lib/notifications/engine/readiness";
import { parseEvent } from "@/lib/parsers/event";
import { parseFairnessTable } from "@/lib/parsers/fairness";
import { parsePotentialSheet } from "@/lib/parsers/potential";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildManagerOverviewReadModel, type NotificationReadinessLookup } from "./buildManagerOverviewReadModel";
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

  const { manager, people, snapshot, avatarUrl } = contextResult.context;

  // PR #40 -- started now (the manager is already authorized above by
  // `loadManagerWorkbookContext`) so its Supabase Admin API + bulk
  // `push_subscriptions` calls run concurrently with the synchronous sheet
  // parsing below instead of serially after it. `loadNotificationReadiness`
  // itself decides skipped/unavailable/ok -- see its own docstring.
  const notificationReadinessPromise = loadNotificationReadiness(people, params.personId);

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

  const notificationReadiness = await notificationReadinessPromise;

  const model = buildManagerOverviewReadModel({
    manager,
    managerAvatarUrl: avatarUrl,
    people,
    events,
    potentialAllocations,
    reserveParticipationByPeriod,
    shiftSchedule,
    fetchedAt: snapshot.fetchedAt,
    now,
    range,
    selectedPersonId: params.personId,
    notificationReadiness,
  });

  return { status: "ok", model };
}

/**
 * The manager overview's own three-way record of the privileged readiness
 * lookup -- `skipped` (a person is selected; `ManagerNotificationReadinessSection`
 * never renders there, so the Supabase Admin API + bulk `push_subscriptions`
 * calls are never even attempted) is explicitly DIFFERENT from `unavailable`
 * (the "everyone" scope DID attempt it, and it failed) -- collapsing both
 * into the same `null`/hidden state would let a real infra outage look
 * identical to "everyone is ready", which is not trustworthy. A push-
 * subscription/Supabase Admin API infra failure must never take down the
 * whole manager overview though -- מצב התראות is optional operational
 * context, not a page-blocking dependency (same defensive convention as
 * `loadRecentDashboardChanges`'s notification-engine query) -- so `unavailable`
 * is a caught, logged (fixed PII-safe string only, never the underlying
 * error, which could carry a raw Supabase response) degradation, not a thrown
 * exception.
 */
async function loadNotificationReadiness(
  people: readonly Person[],
  personId: string | null,
): Promise<NotificationReadinessLookup> {
  if (personId !== null) return { status: "skipped" };

  try {
    const results = await computeNotificationReadiness(people);
    return { status: "ok", results };
  } catch {
    console.error("[manager-overview] notification readiness query failed");
    return { status: "unavailable" };
  }
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
