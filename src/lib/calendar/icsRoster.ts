import { buildShiftRoster } from "@/lib/domain/shiftCoverage";
import type { Event, EventRole } from "@/lib/domain/event";

/**
 * "מי איתי במשמרת" for the ICS feed's `DESCRIPTION` -- reuses
 * `buildShiftRoster` (`lib/domain/shiftCoverage.ts`), the SAME roster
 * query the in-app "מי איתי?" panel (`CounterpartPanel`) is already built
 * on, rather than a second roster/coverage computation. `allEvents` must
 * be the FULL, unfiltered, every-person Event set (never just the
 * subscribed person's own Events, and never date-windowed) -- roster
 * membership is a fact about OTHER people's Events on the target's exact
 * `date`+`period`, entirely independent of the ICS feed's own 30-day/
 * unbounded-future window (`icsWindow.ts`), which only decides which of
 * the SUBSCRIBER's own Events become calendar items in the first place.
 *
 * Dynamic by construction: this is computed fresh from `allEvents` on
 * every call (the feed itself is rebuilt on every request, per PR spec
 * §3) -- nothing here is persisted or snapshotted. Only PRIMARY
 * (`shadow === false`) roster members are listed -- a shadow/handover
 * colleague is informational at best and was never counted as real
 * staffing anywhere else in this domain either (see
 * `analyzeShiftCounterparts`'s own docs), so it's left out of "who's
 * actually with me" here too, matching that established convention
 * rather than inventing a new one.
 *
 * Grouped by role (`roleLabel`'s own supervisor/technician distinction --
 * never a third invented role), each group's names de-duplicated (a
 * genuine split-shift colleague with two Events lists once) and joined
 * with ", " -- `icsEncoding.escapeIcsText` already escapes any resulting
 * comma/newline for the ICS wire format, so this only ever builds plain
 * text. Returns `null` (never an empty/meaningless header) when nobody
 * else is actually on the shift -- "omit empty groups" applies at both
 * the per-role level and this top level.
 *
 * NEVER used for duty/absence Events -- those have no shift roster
 * concept at all (see `icsItems.ts`, which only calls this for
 * `category === "shift"`).
 */
export function buildShiftRosterDescription(event: Event, allEvents: readonly Event[]): string | null {
  const roster = buildShiftRoster(event, allEvents);
  if (roster.primaryRoster.length === 0) return null;

  const namesByRole = new Map<EventRole, string[]>();
  for (const rosterEvent of roster.primaryRoster) {
    const names = namesByRole.get(rosterEvent.role) ?? [];
    if (!names.includes(rosterEvent.personName)) names.push(rosterEvent.personName);
    namesByRole.set(rosterEvent.role, names);
  }

  const lines: string[] = [];
  const supervisors = namesByRole.get("supervisor");
  if (supervisors && supervisors.length > 0) lines.push(`אחמ"ש: ${supervisors.join(", ")}`);
  const technicians = namesByRole.get("technician");
  if (technicians && technicians.length > 0) lines.push(`טכנאים: ${technicians.join(", ")}`);

  if (lines.length === 0) return null;
  return ["איתך במשמרת:", ...lines].join("\n");
}
