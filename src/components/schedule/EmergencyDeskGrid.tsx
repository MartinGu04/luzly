import type { EmergencyDeskSlot } from "@/lib/readModels/emergencyScheduleTypes";

interface EmergencyDeskGridProps {
  desks: readonly EmergencyDeskSlot[];
  className?: string;
}

/**
 * The canonical C:L desk roster grid for one date+period -- every desk,
 * its assigned person (or "לא מאויש" for a genuinely blank one, never a
 * fabricated coverage gap message). Shared by every Emergency Mode
 * surface that shows the FULL desk picture for a shift
 * (`EmergencyEveryoneScheduleList`'s own "all" perspective, the Manager
 * Area's previous/current/next operational overview) so the grid itself
 * can never drift between them.
 *
 * `personName` already carries an unresolved assignment's RAW name (see
 * `EmergencyDeskSlot`'s own docs -- an unresolved `personId: null` still
 * keeps its real `personName`) -- an unresolved person is never dropped
 * here, only a genuinely blank desk cell (`personName: null`) shows "לא
 * מאויש".
 */
export function EmergencyDeskGrid({ desks, className = "" }: EmergencyDeskGridProps) {
  return (
    <ul className={`grid grid-cols-1 gap-1.5 sm:grid-cols-2 ${className}`}>
      {desks.map((slot) => (
        <li
          key={slot.desk}
          className="flex items-center justify-between gap-3 rounded-lg bg-overlay-faint px-3 py-1.5 text-xs ring-1 ring-border"
        >
          <span className="min-w-0 truncate font-medium text-foreground">{slot.desk}</span>
          <span className={`shrink-0 ${slot.personName ? "text-muted" : "text-warning"}`}>{slot.personName ?? "לא מאויש"}</span>
        </li>
      ))}
    </ul>
  );
}
