import "server-only";
import { resolveManagerDateRange } from "@/lib/domain/dateRange";
import { deriveReserveRoleParticipation, type ReserveRoleParticipationSource } from "@/lib/domain/reserveParticipation";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { timedStage, timedSyncStage } from "@/lib/config/timingDiagnostics";
import { parseSourcePeriodYear, type RawSheet } from "@/lib/google";
import { fetchAllUserIdsByEmail, resolvePersonIdentity } from "@/lib/notifications/engine/recipients";
import { computeNotificationReadiness } from "@/lib/notifications/engine/readiness";
import { parseEvent } from "@/lib/parsers/event";
import { parseFairnessTable } from "@/lib/parsers/fairness";
import { parsePotentialSheet } from "@/lib/parsers/potential";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { buildManagerOverviewReadModel, type RosterAvatarLookup } from "./buildManagerOverviewReadModel";
import { type AdoptionReadinessLookup } from "./managerAdoptionProjection";
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
  needsRosterAvatars = false,
): Promise<ManagerOverviewLoadResult> {
  return timedStage("managerOverview.total", () =>
    loadManagerOverviewReadModelInner(params, needsAdoptionReadiness, needsRosterAvatars),
  );
}

async function loadManagerOverviewReadModelInner(
  params: ManagerOverviewParams,
  needsAdoptionReadiness: boolean,
  needsRosterAvatars: boolean,
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
  // Same reasoning, for the Personnel category's own, narrower privileged
  // lookup -- started concurrently with everything else, never serialized
  // after it. `loadRosterAvatarLookup` never touches `push_subscriptions`
  // (PR #96's performance fix) -- see its own docstring.
  const rosterAvatarsPromise = loadRosterAvatarLookup(people, params.personId, needsRosterAvatars);

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

  const [adoption, rosterAvatars] = await Promise.all([adoptionReadinessPromise, rosterAvatarsPromise]);

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
      rosterAvatars,
    }),
  );

  return { status: "ok", model };
}

/**
 * The manager overview's own three-way record of the privileged login/
 * notification readiness lookup -- `skipped` (either a person is selected,
 * so no category -- including "התחברויות" -- renders there; or the
 * requested category simply isn't "התחברויות", so the page is never
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
 * The Personnel category's ("כוח אדם") own privileged lookup -- deliberately
 * NARROWER than `loadAdoptionReadiness` above: it decorates the roster with
 * real Google profile photos, so it only needs one bulk
 * `fetchAllUserIdsByEmail()` account-directory call (the SAME Supabase Admin
 * API primitive `recipients.ts`/`readiness.ts` already share), never the
 * full `computeNotificationReadiness()` -- which would additionally run a
 * bulk `push_subscriptions` query this category has no use for. This is the
 * PR #96 performance fix's boundary made explicit for Personnel: switching
 * to Personnel must cost exactly one extra Admin API call, never a second
 * DB query on top of it.
 *
 * Every roster person's avatar is resolved via the EXISTING, pure
 * `resolvePersonIdentity()` (no new email-matching logic, no per-person
 * Admin API call, no fuzzy/display-name guessing) against the ONE already-
 * fetched account directory -- an `unmapped`/`ambiguous`/`no_email` identity,
 * or a mapped account with no photo, is simply never added to `avatars`
 * (never a `null` placeholder entry either) -- `ManagerRosterSection` reads
 * "absent from the map" as "show initials".
 *
 * Same two independent skip conditions as `loadAdoptionReadiness`: a
 * selected person never renders `ManagerRosterSection` at all, and every
 * non-Personnel category has no use for this either. Same fail-soft
 * contract too -- an Admin API failure degrades to `unavailable` (a fixed,
 * PII-safe log line only, never the raw Supabase error/any name or email),
 * never a thrown exception that would take down the whole Personnel page;
 * the roster still renders normally, just on initials.
 */
async function loadRosterAvatarLookup(
  people: readonly Person[],
  personId: string | null,
  needsRosterAvatars: boolean,
): Promise<RosterAvatarLookup> {
  if (personId !== null || !needsRosterAvatars) return { status: "skipped" };

  try {
    const emailToAccount = await timedStage("manager.rosterAvatars", () => fetchAllUserIdsByEmail());
    const avatars = new Map<string, string>();
    for (const person of people) {
      const identity = resolvePersonIdentity(person, people, emailToAccount);
      if (identity.status === "mapped" && identity.avatarUrl) avatars.set(person.id, identity.avatarUrl);
    }
    return { status: "ok", avatars };
  } catch {
    console.error("[manager-overview] roster avatar lookup failed");
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
