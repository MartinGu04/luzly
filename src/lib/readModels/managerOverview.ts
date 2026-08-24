import "server-only";
import { resolveManagerDateRange } from "@/lib/domain/dateRange";
import { deriveReserveRoleParticipation, type ReserveRoleParticipationSource } from "@/lib/domain/reserveParticipation";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { timedStage, timedSyncStage } from "@/lib/config/timingDiagnostics";
import { parseSourcePeriodYear, type RawSheet } from "@/lib/google";
import { computeNotificationReadiness } from "@/lib/notifications/engine/readiness";
import { parseEvent } from "@/lib/parsers/event";
import { parseFairnessTable } from "@/lib/parsers/fairness";
import { parsePotentialSheet } from "@/lib/parsers/potential";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildManagerOverviewReadModel, type AdoptionReadinessLookup } from "./buildManagerOverviewReadModel";
import { getManagerWorkbookSheet, loadManagerWorkbookContext } from "./managerWorkbookContext";
import type { ManagerOverviewParams } from "./managerOverviewParams";
import type { ManagerOverviewReadModel } from "./managerTypes";

export type ManagerOverviewLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  | { status: "configuration_error"; message: string }
  /**
   * Authenticated + uniquely mapped, but `person.isManager !== true`.
   * `loadManagerWorkbookContext()`'s shared workbook batch WAS already
   * fetched (needed to resolve `person` in the first place -- see that
   * function's own "Is fetching before the manager check safe?" section),
   * but no `ManagerOverviewReadModel` is ever built or returned here.
   */
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
 *
 * `needsAdoptionReadiness` is the caller's (`app/(app)/manager/page.tsx`)
 * own determination of whether the CURRENTLY REQUESTED category is the one
 * that actually renders login/adoption data (`"logins"`) -- see
 * `loadAdoptionReadiness` below for why this matters. Wrapped in
 * `timedStage("managerOverview.total", ...)` so its total duration is
 * directly comparable against its own sub-stages below (same convention
 * `personalSchedule.ts` already established) and against
 * `manager.authContext`/`workbook.cache(...)`/`auth.getUser` -- see
 * `lib/config/timingDiagnostics.ts`.
 */
export async function loadManagerOverviewReadModel(
  params: ManagerOverviewParams,
  needsAdoptionReadiness: boolean,
): Promise<ManagerOverviewLoadResult> {
  return timedStage("managerOverview.total", () =>
    loadManagerOverviewReadModelInner(params, needsAdoptionReadiness),
  );
}

async function loadManagerOverviewReadModelInner(
  params: ManagerOverviewParams,
  needsAdoptionReadiness: boolean,
): Promise<ManagerOverviewLoadResult> {
  const contextResult = await loadManagerWorkbookContext();
  if (contextResult.status !== "ok") return contextResult;

  const { manager, people, snapshot, avatarUrl } = contextResult.context;

  // Started now (the manager is already authorized above by
  // `loadManagerWorkbookContext`) so its Supabase Admin API + bulk
  // `push_subscriptions` calls run concurrently with the synchronous sheet
  // parsing below instead of serially after it. `loadAdoptionReadiness`
  // itself decides skipped/unavailable/ok -- see its own docstring.
  const adoptionReadinessPromise = loadAdoptionReadiness(people, params.personId, needsAdoptionReadiness);

  const settings = timedSyncStage("manager.settings.parse", () =>
    parseSettingsSheet(getManagerWorkbookSheet(snapshot, "settings")),
  );

  let shiftSchedule: ShiftSchedule;
  try {
    shiftSchedule = buildShiftSchedule(settings.shiftStartTimeDay);
  } catch (error) {
    if (error instanceof ShiftConfigurationError) {
      return { status: "configuration_error", message: error.message };
    }
    throw error;
  }

  const events = timedSyncStage("manager.schedule.parse", () => {
    const rawAssignments = parseScheduleSheet(getManagerWorkbookSheet(snapshot, "schedule"), people);
    return rawAssignments.map(parseEvent);
  });

  const potentialAllocations = timedSyncStage("manager.potential.parse", () => [
    ...parsePotentialSheet(getManagerWorkbookSheet(snapshot, "potentialH1"), people),
    ...parsePotentialSheet(getManagerWorkbookSheet(snapshot, "potentialH2"), people),
  ]);

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
  const reserveParticipationByPeriod = timedSyncStage("manager.fairness.parse", () => ({
    h1: reserveParticipationSource(getManagerWorkbookSheet(snapshot, "potentialH1"), people),
    h2: reserveParticipationSource(getManagerWorkbookSheet(snapshot, "potentialH2"), people),
  }));

  const now = getJerusalemLocalNow();
  const range = resolveManagerDateRange(params.range, params.month, now);

  const adoption = await adoptionReadinessPromise;

  const model = timedSyncStage("manager.readModel.build", () =>
    buildManagerOverviewReadModel({
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
      adoption,
    }),
  );

  return { status: "ok", model };
}

/**
 * The manager overview's own three-way record of the privileged login/
 * notification readiness lookup -- `skipped` (either a person is selected,
 * so no category -- including "התחברויות והתראות" -- renders there; or the
 * requested category simply isn't "התחברויות והתראות", so the page is never
 * going to render this data either way) is explicitly DIFFERENT from
 * `unavailable` (the "everyone" + "logins" scope DID attempt it, and it
 * failed) -- collapsing both into the same `null`/hidden state would let a
 * real infra outage look identical to "everyone is ready", which is not
 * trustworthy. A push-subscription/Supabase Admin API infra failure must
 * never take down the whole manager overview though -- adoption is
 * optional operational context, not a page-blocking dependency (same
 * defensive convention as `loadRecentDashboardChanges`'s notification-
 * engine query) -- so `unavailable` is a caught, logged (fixed PII-safe
 * string only, never the underlying error, which could carry a raw
 * Supabase response) degradation, not a thrown exception.
 *
 * `needsAdoptionReadiness` (from the caller's own parsed `?category=`) is
 * what actually gates the privileged Supabase Admin API `listUsers()` +
 * bulk `push_subscriptions` query below -- switching to Overview/Shifts/
 * Personnel/Duties, or drilling into a selected person, must never pay for
 * this I/O just because it happens to share the same whole-team read
 * model. `personId !== null` is checked independently (never folded into
 * `needsAdoptionReadiness` upstream) so a selected-person request is
 * skipped on its own terms even if some future caller mis-set the category
 * flag -- two independent reasons to skip, not one.
 */
async function loadAdoptionReadiness(
  people: readonly Person[],
  personId: string | null,
  needsAdoptionReadiness: boolean,
): Promise<AdoptionReadinessLookup> {
  if (personId !== null || !needsAdoptionReadiness) return { status: "skipped" };

  try {
    const results = await timedStage("manager.adoptionReadiness", () => computeNotificationReadiness(people));
    return { status: "ok", results };
  } catch {
    console.error("[manager-overview] adoption readiness query failed");
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
