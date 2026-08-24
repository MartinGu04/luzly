import "server-only";
import type { Person } from "@/lib/domain/types";
import { timedStage } from "@/lib/config/timingDiagnostics";
import { computeNotificationReadiness } from "@/lib/notifications/engine/readiness";
import { buildManagerRoster, toManagerAdoptionState, type AdoptionReadinessLookup } from "./managerAdoptionProjection";
import { loadManagerPersonnelContext, type ManagerPersonnelContextResult } from "./managerWorkbookContext";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "./managerTypes";

export type NotificationCenterContextResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  /** Authenticated + mapped, but `person.isManager !== true` -- מרכז התראות is Manager-only, same as `/manager` itself. */
  | { status: "forbidden" }
  | { status: "ok"; context: NotificationCenterContext };

/**
 * The standalone Notification Center's own narrow read model -- deliberately
 * NOT `ManagerOverviewReadModel`: this page never parses schedule/settings/
 * Potential, never runs `detectOperationalIssues()`, and never builds a
 * `ShiftSchedule` (see `loadNotificationCenterContext` below, which reuses
 * the SAME lightweight `loadManagerPersonnelContext()` boundary the existing
 * broadcast/rule Server Actions already use for their own polling). Only
 * what "עכשיו"/"תזמון"/"קבועות" actually render: a manager-safe roster
 * projection and the same readiness/adoption projection "התחברויות" already
 * uses -- never a raw `Person`, Supabase `User`, email, or push-subscription
 * record.
 */
export interface NotificationCenterContext {
  /** Manager-safe roster, for the audience picker every composer/rule editor needs. Empty when the active section has no use for it (`needsRosterAndAdoption=false`, e.g. "היסטוריה") -- never fetched/built for nothing. */
  roster: ManagerPersonSummary[];
  /**
   * Empty when this section doesn't need readiness annotations at all, or
   * the privileged lookup itself failed -- every roster/audience picker
   * already treats an empty array as "no readiness annotation available,
   * the picker still works", the exact same contract
   * `ManagerBroadcastComposer`/`ManagerFixedNotificationsSection` already
   * document for their own `adoptionPeople` prop. Never a second,
   * distinguishable "unavailable" state here -- unlike `/manager`'s own
   * "התחברויות" category, the Notification Center's other three sections
   * have no dedicated UI slot for an adoption-lookup-failed notice.
   */
  adoptionPeople: ManagerAdoptionPersonView[];
}

/**
 * Server-only orchestration for `NotificationCenterContext`. Authorization
 * + the personnel-only workbook read live in `loadManagerPersonnelContext()`
 * (`managerWorkbookContext.ts`) -- the SAME lightweight, short-TTL-cached
 * boundary the existing scheduled/recent-broadcast polls and notification-
 * rule actions already use, never the heavier 5-source
 * `loadManagerWorkbookContext()` Manager Overview itself needs. This
 * function adds exactly one thing on top: the SAME bulk
 * `computeNotificationReadiness()` privileged lookup "התחברויות" already
 * uses (Admin API `listUsers()` + `push_subscriptions`), gated by
 * `needsRosterAndAdoption` so "היסטוריה" -- which renders no roster/
 * audience picker at all -- never pays for either the roster projection or
 * the readiness query.
 */
export async function loadNotificationCenterContext(
  needsRosterAndAdoption: boolean,
): Promise<NotificationCenterContextResult> {
  return timedStage("notificationCenter.total", () => loadNotificationCenterContextInner(needsRosterAndAdoption));
}

async function loadNotificationCenterContextInner(
  needsRosterAndAdoption: boolean,
): Promise<NotificationCenterContextResult> {
  const contextResult: ManagerPersonnelContextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return contextResult;

  if (!needsRosterAndAdoption) {
    return { status: "ok", context: { roster: [], adoptionPeople: [] } };
  }

  const { people } = contextResult.context;
  const roster = buildManagerRoster(people);
  const adoptionPeople = await loadAdoptionPeople(people);

  return { status: "ok", context: { roster, adoptionPeople } };
}

/**
 * Fail-soft exactly like `managerOverview.ts`'s own `loadAdoptionReadiness`
 * -- an Admin API / `push_subscriptions` failure degrades to an empty
 * `adoptionPeople` list (the picker still works, on initials/no readiness
 * badge), never a thrown exception that would take down the whole
 * Notification Center. Logs only a fixed, PII-safe diagnostic line, never
 * the raw Supabase error.
 */
async function loadAdoptionPeople(people: readonly Person[]): Promise<ManagerAdoptionPersonView[]> {
  let lookup: AdoptionReadinessLookup;
  try {
    const results = await timedStage("notificationCenter.adoptionReadiness", () => computeNotificationReadiness(people));
    lookup = { status: "ok", results };
  } catch {
    console.error("[notification-center] adoption readiness query failed");
    lookup = { status: "unavailable" };
  }

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const state = toManagerAdoptionState(lookup, peopleById);
  return state.status === "available" ? state.view.people : [];
}
