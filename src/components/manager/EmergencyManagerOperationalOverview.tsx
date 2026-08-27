import { Panel } from "@/components/ui/Panel";
import { EmergencyDeskGrid } from "@/components/schedule/EmergencyDeskGrid";
import { EmergencyEveryoneScheduleList } from "@/components/schedule/EmergencyEveryoneScheduleList";
import { assignmentEmoji } from "@/lib/presentation/emoji";
import { formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
import { periodLabel } from "@/lib/presentation/labels";
import type { EmergencyManagerOperationalOverview as EmergencyManagerOperationalOverviewModel } from "@/lib/readModels/buildEmergencyManagerOverview";
import type { EmergencyEveryoneShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";

interface EmergencyManagerOperationalOverviewProps {
  overview: EmergencyManagerOperationalOverviewModel;
  /** The full unscoped desk-staffing history -- kept, but as a secondary, collapsed-by-default section (spec: "historical shifts must not dominate the main manager overview"), never the first thing shown. */
  fullSchedule: readonly EmergencyEveryoneShiftEntry[];
}

type ShiftRole = "previous" | "current" | "next";

const ROLE_TITLE: Record<ShiftRole, string> = {
  previous: "משמרת קודמת",
  current: "משמרת נוכחית",
  next: "משמרת הבאה",
};

/**
 * Three-tier visual emphasis reusing `Panel`'s OWN existing variant
 * vocabulary (its own docstring: "hero for the primary now... state") --
 * never an invented styling mechanism. `current` gets the strongest
 * treatment (`hero`), `next` a standard, clearly-present one (`panel`),
 * `previous` the quietest/densest one (`compact`), further muted via a
 * lower-emphasis title color and a touch of opacity.
 */
const ROLE_VARIANT: Record<ShiftRole, "hero" | "panel" | "compact"> = {
  previous: "compact",
  current: "hero",
  next: "panel",
};

const ROLE_TITLE_CLASS: Record<ShiftRole, string> = {
  previous: "text-muted-2",
  current: "text-primary",
  next: "text-foreground",
};

function ShiftOverviewCard({ role, entry }: { role: ShiftRole; entry: EmergencyEveryoneShiftEntry | null }) {
  const shiftColorInput = entry ? { category: "shift" as const, period: entry.period, dutyFamily: null, absenceKind: null } : null;
  const emoji = shiftColorInput ? assignmentEmoji(shiftColorInput) : null;
  const label = entry ? (periodLabel(entry.period) ?? "משמרת") : null;

  return (
    <Panel
      variant={ROLE_VARIANT[role]}
      className={`flex flex-col gap-2.5 ${role === "previous" ? "opacity-80" : ""}`}
      data-testid={`emergency-manager-shift-${role}`}
    >
      <p className={`text-sm font-semibold ${ROLE_TITLE_CLASS[role]}`}>{ROLE_TITLE[role]}</p>

      {entry ? (
        <>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-2">
            {emoji ? <span aria-hidden="true">{emoji}</span> : null}
            {formatHebrewWeekdayAndDate(entry.date)} · משמרת {label}
          </p>
          <EmergencyDeskGrid desks={entry.desks} />
        </>
      ) : (
        <p className="text-sm text-muted">אין נתוני שיבוץ למשמרת זו.</p>
      )}
    </Panel>
  );
}

/**
 * The Manager Area's Emergency Mode "all" perspective default view (spec:
 * "operational and immediate", not a chronological dump) --
 * "משמרת קודמת | משמרת נוכחית | משמרת הבאה", each a compact desk
 * roster/grid rather than one giant card per desk/assignment. Rendered in
 * that literal DOM order -- in this app's RTL layout, source order reads
 * right-to-left, so "קודמת" (previous) sits rightmost, "הבאה" (next)
 * leftmost, matching the spec's own reading order without any manual
 * reordering.
 *
 * `overview` itself is never `null` (`resolveEmergencyManagerOverview`
 * always returns a real object) -- only its three FIELDS can be, exactly
 * when nothing was recorded for that specific date+period (spec: "If
 * there is no active shift at the exact current time, show an
 * appropriate calm empty/current state while still showing previous and
 * next when available" -- each card degrades independently, never
 * blocking its siblings).
 *
 * `fullSchedule` (the full, unscoped desk-staffing history --
 * `EmergencyScheduleReadModel.everyoneShifts`, UNCHANGED data) reuses
 * `EmergencyEveryoneScheduleList` completely unmodified, just relocated
 * behind a collapsed `<details>` disclosure -- the SAME collapsed-by-
 * default pattern `ManagerAdoptionSection`'s own "quiet" groups and the
 * personal agenda's own history section already use, so old/historical
 * shifts can never dominate this default view again.
 */
export function EmergencyManagerOperationalOverview({ overview, fullSchedule }: EmergencyManagerOperationalOverviewProps) {
  return (
    <div className="flex flex-col gap-4" data-testid="emergency-manager-operational-overview">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ShiftOverviewCard role="previous" entry={overview.previous} />
        <ShiftOverviewCard role="current" entry={overview.current} />
        <ShiftOverviewCard role="next" entry={overview.next} />
      </div>

      {fullSchedule.length > 0 ? (
        <details data-testid="emergency-manager-full-schedule">
          <summary className="cursor-pointer text-sm font-semibold text-muted-2">
            לכל סידור החירום <span className="font-normal">· {fullSchedule.length}</span>
          </summary>
          <div className="mt-3">
            <EmergencyEveryoneScheduleList shifts={[...fullSchedule]} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
