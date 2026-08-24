import type { ManagerAdoptionPersonView } from "@/lib/readModels/managerTypes";

export interface AudienceSummaryView {
  selectedCount: number;
  pushCapableCount: number;
  inboxOnlyCount: number;
  unresolvedCount: number;
}

/**
 * A client-side ESTIMATE of what a selection will resolve to -- built
 * purely from the SAME `ManagerAdoptionPersonView[]` readiness projection
 * "מרכז התראות" (`/notifications`) already loads for its "עכשיו"/"תזמון"/
 * "קבועות" sections, never a second readiness computation. Advisory only,
 * before the manager clicks send: the server
 * independently re-resolves every recipient from scratch at send time
 * (`sendManagerBroadcastNotification`), so a stale or tampered client view
 * can never change who actually gets notified -- only what the manager
 * sees on this screen before clicking send.
 *
 * A selected person absent from `adoptionByPersonId` (adoption data
 * unavailable, or a roster id that doesn't match any known adoption row)
 * counts as unresolved here too -- never silently dropped from the count.
 */
export function computeAudienceSummary(
  selectedPersonIds: readonly string[],
  adoptionByPersonId: ReadonlyMap<string, ManagerAdoptionPersonView>,
): AudienceSummaryView {
  let pushCapableCount = 0;
  let inboxOnlyCount = 0;
  let unresolvedCount = 0;

  for (const personId of selectedPersonIds) {
    const adoption = adoptionByPersonId.get(personId);
    if (adoption?.notificationStatus === "ready") {
      pushCapableCount++;
    } else if (adoption?.notificationStatus === "not_enabled") {
      inboxOnlyCount++;
    } else {
      unresolvedCount++;
    }
  }

  return { selectedCount: selectedPersonIds.length, pushCapableCount, inboxOnlyCount, unresolvedCount };
}

/** A short, restrained Hebrew reason label for why one person currently can't be targeted -- shown next to their name in the picker. */
export function unresolvedReasonLabel(person: ManagerAdoptionPersonView): string | null {
  if (person.dataIssue === "missing_email") return "חסר מייל בכ״א";
  if (person.dataIssue === "ambiguous_email") return "מייל משויך ליותר מאדם אחד";
  if (person.loginStatus === "not_logged_in") return "טרם נכנס/ה למערכת";
  return null;
}
