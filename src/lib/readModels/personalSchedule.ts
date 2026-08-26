import "server-only";
import { resolveIdentityAgainstPeople } from "@/lib/auth/resolveCurrentPerson";
import { getRequestAuthenticatedIdentity } from "@/lib/auth/getRequestAuthenticatedIdentity";
import { timedStage, timedSyncStage } from "@/lib/config/timingDiagnostics";
import { ShiftConfigurationError, buildShiftSchedule, type ShiftSchedule } from "@/lib/domain/shiftSchedule";
import { SHEET_SOURCES, type RawSheet, type RawWorkbookSnapshot, type SheetSourceKey } from "@/lib/google";
import { parseEvent } from "@/lib/parsers/event";
import { parsePersonnelSheet } from "@/lib/parsers/personnel";
import { parsePotentialSheet } from "@/lib/parsers/potential";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { parseSettingsSheet } from "@/lib/parsers/settings";
import { getWorkbookSnapshot } from "@/lib/sync";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { resolveOperationalRoster } from "./operationalMode";
import { buildEmergencyPersonalHome } from "./buildEmergencyPersonalHome";
import type { EmergencyPersonalHomeReadModel } from "./emergencyPersonalHomeTypes";
import { buildPersonalScheduleReadModel, toPersonalProfile } from "./buildPersonalScheduleReadModel";
import type { PersonalProfile, PersonalScheduleReadModel } from "./types";

export type PersonalScheduleLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  /**
   * `person` here is the same safe profile as `PersonalScheduleReadModel.person`
   * -- the identity itself resolved successfully; only the shift-schedule
   * *configuration* is broken. This lets the app shell still show who's
   * signed in and offer sign-out while the dashboard content area renders a
   * polished "can't compute shift hours right now" state instead of the
   * real schedule. `message` is for server-side diagnostics only -- the UI
   * must never render it (never the raw exception text).
   *
   * `avatarUrl` (both here and on "ok" below) is carried as a sibling of
   * `person`/`model`, deliberately never folded into `PersonalProfile`/
   * `PersonalScheduleReadModel` themselves -- it comes from the Supabase
   * auth identity, not כ"א/`Person`, and must stay presentation-only,
   * never something the domain/personnel layer could read back and treat
   * as identity data.
   *
   * `userId` (both here and on "ok" below) is the same kind of auth-only
   * sibling as `avatarUrl` -- the authenticated Supabase user id, used
   * ONLY to key the client-side per-user/per-device Push notification
   * preference (`lib/notifications/pushPreference.ts`). Never folded into
   * `PersonalProfile`/`PersonalScheduleReadModel`: personnel/domain
   * identity stays email-keyed, and this auth id must never become a
   * second identity concept the domain layer could read back.
   *
   * `accountCreatedAt` (both here and on "ok" below) is the same kind of
   * auth-only sibling -- Supabase's server-verified account-creation
   * timestamp (`AuthIdentityResult.createdAt`), threaded through untouched
   * for exactly one purpose: `lib/config/onboardingRollout.ts`'s
   * account-level "is this user eligible for the setup card" gate. Never a
   * personnel/domain field, and never derived from anything device-local.
   */
  | {
      status: "configuration_error";
      message: string;
      person: PersonalProfile;
      avatarUrl: string | null;
      userId: string;
      accountCreatedAt: string;
    }
  | { status: "ok"; model: PersonalScheduleReadModel; avatarUrl: string | null; userId: string; accountCreatedAt: string }
  /**
   * Emergency Mode is active and its workbook is readable -- the
   * personal operational shift model comes EXCLUSIVELY from
   * `emergencyHome` (spec section 9). Regular duty/Potential content is
   * never generated here.
   */
  | {
      status: "emergency";
      person: PersonalProfile;
      emergencyHome: EmergencyPersonalHomeReadModel;
      avatarUrl: string | null;
      userId: string;
      accountCreatedAt: string;
    }
  /**
   * Emergency Mode is active but its own workbook could not be
   * configured/read/parsed -- a DISTINCT status from `configuration_error`
   * (which is about the REGULAR shift-time setting): this must render a
   * clear "emergency data unavailable" state, and must NEVER fall back to
   * regular Schedule data while the system claims Emergency Mode is
   * active (spec section 4/29).
   */
  | {
      status: "emergency_unavailable";
      message: string;
      person: PersonalProfile;
      avatarUrl: string | null;
      userId: string;
      accountCreatedAt: string;
    };

/**
 * Everything this read model needs from the workbook. `potentialH1`/
 * `potentialH2` (תקשא"ס period allocations) are fetched alongside the core
 * three sources -- same fixed set `FAIRNESS_WORKBOOK_SOURCES` already
 * establishes (`fairnessWorkbookContext.ts`) -- so a person whose duties
 * exist only in a תקשא"ס period source (never in "משמרות + תורנויות") still
 * shows up on their own Duties page. Both periods (not just the current
 * one) are fetched so the page's own history rules can reach back into an
 * already-closed period, not merely the currently-active one.
 */
const REQUIRED_SOURCES: SheetSourceKey[] = ["personnel", "schedule", "settings", "potentialH1", "potentialH2"];

/** Looks a sheet up by its logical source name rather than trusting snapshot array order. */
function getSheetByKey(snapshot: RawWorkbookSnapshot, key: SheetSourceKey): RawSheet {
  const name = SHEET_SOURCES[key];
  const sheet = snapshot.sheets.find((candidate) => candidate.name === name);
  if (!sheet) {
    throw new Error(`Workbook snapshot is missing the "${name}" sheet.`);
  }
  return sheet;
}

/**
 * Server-only orchestration for the authenticated person's
 * `PersonalScheduleReadModel`:
 *
 * 1. Resolves the Supabase identity; a non-authenticated session never
 *    triggers a Google request at all.
 * 2. Gets personnel + schedule + settings + potentialH1 + potentialH2 via
 *    `lib/sync`'s `getWorkbookSnapshot` -- a short-TTL cached wrapper
 *    around the single underlying `fetchRawWorkbookSnapshot` batchGet call
 *    -- so navigating between pages moments apart reuses the same recent
 *    snapshot instead of re-reading Google every time.
 * 3. Parses personnel and resolves the authenticated Person via the same
 *    fail-closed `resolveIdentityAgainstPeople` behavior `resolveCurrentPerson`
 *    uses — no second personnel fetch/parse.
 * 4. On any non-"ok" identity result, returns the same safe typed state
 *    without ever parsing/projecting a personal schedule.
 * 5. Parses the schedule into Events, settings into a `ShiftSchedule`
 *    (fails closed as `configuration_error` — never a default start time),
 *    and both Potential periods into `PotentialAllocation[]` — the SAME
 *    structural parser Manager Overview already uses, unchanged.
 * 6. Delegates all read-model construction to the pure, independently
 *    testable `buildPersonalScheduleReadModel`, which is the one place
 *    that resolves which allocations belong to this person and folds them
 *    into `dutyBlocks`/`dutyActions` (see `buildPotentialDutyEvents`).
 *
 * Wrapped in `timedStage("personalSchedule.total", ...)` so its total
 * duration is directly comparable against each of its own sub-stages'
 * timings below -- see `lib/config/timingDiagnostics.ts`.
 */
export async function loadPersonalScheduleReadModel(): Promise<PersonalScheduleLoadResult> {
  return timedStage("personalSchedule.total", () => loadPersonalScheduleReadModelInner());
}

async function loadPersonalScheduleReadModelInner(): Promise<PersonalScheduleLoadResult> {
  // Request-scoped memoized (`cache()`, see `getRequestAuthenticatedIdentity`'s
  // own docs) -- still a genuinely live Supabase `getUser()` call every new
  // request, just shared within THIS one if another loader on the same
  // render (e.g. `managerWorkbookContext.ts`'s manager-authorization gate)
  // already triggered it.
  const identity = await getRequestAuthenticatedIdentity();
  if (identity.status === "unauthenticated") return { status: "unauthenticated" };
  if (identity.status === "missing_email") return { status: "missing_email" };

  const snapshot = await getWorkbookSnapshot(REQUIRED_SOURCES);

  const people = timedSyncStage("personnel.parse", () => parsePersonnelSheet(getSheetByKey(snapshot, "personnel")));
  const identityResult = resolveIdentityAgainstPeople(identity, people);

  if (identityResult.status === "unmapped") return { status: "unmapped" };
  if (identityResult.status === "ambiguous_identity") return { status: "ambiguous_identity" };
  if (identityResult.status !== "ok") return { status: identityResult.status };

  const settings = timedSyncStage("settings.parse", () => parseSettingsSheet(getSheetByKey(snapshot, "settings")));

  // Best-effort only here -- a broken regular shift-time configuration
  // must never block the Emergency Mode personal view (that's a
  // REGULAR-mode configuration_error concern below); it only means
  // `buildEmergencyPersonalHome` can't report exact shift minute
  // boundaries and can't determine "current" (see that function's own
  // docs), never a hard failure for the emergency branch.
  let bestEffortShiftSchedule: ShiftSchedule | null = null;
  try {
    bestEffortShiftSchedule = buildShiftSchedule(settings.shiftStartTimeDay);
  } catch (error) {
    if (!(error instanceof ShiftConfigurationError)) throw error;
  }

  const operationalRoster = await resolveOperationalRoster(people);
  if (operationalRoster.mode === "emergency_unavailable") {
    return {
      status: "emergency_unavailable",
      message: operationalRoster.message,
      person: toPersonalProfile(identityResult.person),
      avatarUrl: identity.avatarUrl,
      userId: identity.userId,
      accountCreatedAt: identity.createdAt,
    };
  }
  if (operationalRoster.mode === "emergency") {
    const emergencyHome = buildEmergencyPersonalHome({
      period: operationalRoster.period,
      assignments: operationalRoster.assignments,
      personId: identityResult.person.id,
      now: getJerusalemLocalNow(),
      schedule: bestEffortShiftSchedule,
      fetchedAt: operationalRoster.fetchedAt,
      diagnostics: operationalRoster.diagnostics,
    });
    return {
      status: "emergency",
      person: toPersonalProfile(identityResult.person),
      emergencyHome,
      avatarUrl: identity.avatarUrl,
      userId: identity.userId,
      accountCreatedAt: identity.createdAt,
    };
  }

  let shiftSchedule: ShiftSchedule;
  try {
    shiftSchedule = buildShiftSchedule(settings.shiftStartTimeDay);
  } catch (error) {
    if (error instanceof ShiftConfigurationError) {
      return {
        status: "configuration_error",
        message: error.message,
        person: toPersonalProfile(identityResult.person),
        avatarUrl: identity.avatarUrl,
        userId: identity.userId,
        accountCreatedAt: identity.createdAt,
      };
    }
    throw error;
  }

  const events = timedSyncStage("schedule.parse", () => {
    const rawAssignments = parseScheduleSheet(getSheetByKey(snapshot, "schedule"), people);
    return rawAssignments.map(parseEvent);
  });

  const potentialAllocations = timedSyncStage("potential.parse", () => [
    ...parsePotentialSheet(getSheetByKey(snapshot, "potentialH1"), people),
    ...parsePotentialSheet(getSheetByKey(snapshot, "potentialH2"), people),
  ]);

  const model = timedSyncStage("readModel.build", () =>
    buildPersonalScheduleReadModel({
      person: identityResult.person,
      people,
      events,
      shiftSchedule,
      fetchedAt: snapshot.fetchedAt,
      now: getJerusalemLocalNow(),
      potentialAllocations,
    }),
  );

  return { status: "ok", model, avatarUrl: identity.avatarUrl, userId: identity.userId, accountCreatedAt: identity.createdAt };
}
