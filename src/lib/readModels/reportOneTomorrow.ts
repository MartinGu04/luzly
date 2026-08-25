import "server-only";
import { buildReportOneDraft, resolveReportOneTargetDate, type ReportOneDraft } from "@/lib/domain/reportOne";
import { parseEvent } from "@/lib/parsers/event";
import { parseScheduleSheet } from "@/lib/parsers/schedule";
import { getReserveInclusionPreferences } from "@/lib/reportOne/store";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { getManagerWorkbookSheet, loadManagerWorkbookContext, MANAGER_WORKBOOK_SOURCES } from "./managerWorkbookContext";

export type ReportOneTomorrowLoadResult =
  | { status: "unauthenticated" }
  | { status: "missing_email" }
  | { status: "unmapped" }
  | { status: "ambiguous_identity" }
  /** Authenticated + mapped, but `person.isManager !== true` -- same boundary as `/manager` itself. */
  | { status: "forbidden" }
  /**
   * `reserveInclusionByPersonId` -- one entry for every מילואים person in
   * `draft`'s own reserve section (never any other section), already
   * DEFAULTED to `true` for anyone who has never had an explicit
   * preference saved (see `lib/reportOne/store.ts`'s own docs) -- the
   * UI never has to apply that default itself.
   */
  | { status: "ok"; draft: ReportOneDraft; reserveInclusionByPersonId: Record<string, boolean> };

/**
 * Server-only orchestration for "דוח 1 למחר". Reuses `loadManagerWorkbookContext`
 * for the exact same manager-authorization + workbook-fetch boundary every
 * other manager feature uses (never a separate/weaker check) -- `isManager
 * === true` ALONE, exactly like `/manager` (Manager Overview) itself. Report 1
 * needs department-wide roster/schedule visibility, which is precisely what
 * that boundary already grants; it is deliberately NOT further restricted to
 * permanent (קבע) managers -- a shift-working (סדיר/מילואים) manager, e.g. an
 * אחמ"ש with manager access, is equally authorized to prepare Report 1. This
 * used to also require `classifyPersonnelType(manager.personnelType) ===
 * "permanent"`; that extra restriction conflated "is a permanent-manager Home
 * user" with "is authorized to use Report 1" and has been removed -- see
 * `page.tsx` for how the Home quick action itself now reaches every manager,
 * not only the permanent-manager Home.
 *
 * Requests the SAME `MANAGER_WORKBOOK_SOURCES` batch `getRequestPermanentManagerHome()`
 * does (not a narrower `["personnel","schedule"]` set) purely so that, when
 * both are called for the same Home render, `getWorkbookSnapshot`'s
 * canonical-key cache resolves to the identical already-fetched snapshot
 * instead of a second Google request -- Report 1 itself never reads
 * "settings"/"potentialH1"/"potentialH2" from it (no `ShiftSchedule` is
 * needed: `Event.role`/`Event.period` are already classified by
 * `parseEvent`, and the day/night carryover Report 1 needs is structural,
 * not minute-exact -- see `resolveRegularOrReserveStatus`'s own docs).
 */
export async function loadReportOneTomorrow(): Promise<ReportOneTomorrowLoadResult> {
  const contextResult = await loadManagerWorkbookContext([...MANAGER_WORKBOOK_SOURCES]);
  if (contextResult.status !== "ok") return contextResult;

  const { people, snapshot } = contextResult.context;

  const rawAssignments = parseScheduleSheet(getManagerWorkbookSheet(snapshot, "schedule"), people);
  const events = rawAssignments.map(parseEvent);

  const now = getJerusalemLocalNow();
  const targetDate = resolveReportOneTargetDate(now);

  const draft = buildReportOneDraft({ people, events, targetDate, prevDate: now.date });

  const reserveSection = draft.sections.find((section) => section.section === "reserve");
  const reservePersonIds = reserveSection?.people.map((person) => person.personId) ?? [];
  const explicitPreferences = await getReserveInclusionPreferences(reservePersonIds);
  const reserveInclusionByPersonId: Record<string, boolean> = {};
  for (const personId of reservePersonIds) {
    reserveInclusionByPersonId[personId] = explicitPreferences.get(personId) ?? true;
  }

  return { status: "ok", draft, reserveInclusionByPersonId };
}
