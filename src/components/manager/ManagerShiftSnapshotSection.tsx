import { ShiftSnapshotCard } from "@/components/home/ShiftSnapshotCard";
import type { ShiftSnapshotTriad } from "@/lib/readModels/shiftSnapshot";

interface ManagerShiftSnapshotSectionProps {
  snapshot: ShiftSnapshotTriad;
  todayDate: string;
  fetchedAt: string;
}

/**
 * "תמונת מצב משמרות" -- a compact operational section inside the Manager Area's
 * own Overview category, for a manager who is themselves shift-capable
 * (e.g. an אחמ״ש with manager access; see `isShiftCapable`,
 * `lib/domain/personnelType.ts`). Reuses `ShiftSnapshotCard` (the exact
 * same component the permanent-manager Home uses for its own "מה קורה
 * עכשיו במחלקה?" hero layout) completely unmodified -- Google photo/live
 * progress/coverage badges/role rosters all come from there, never
 * reimplemented.
 *
 * Deliberately a plain, EQUAL three-column grid rather than the Home's
 * `[1fr_1.5fr_1fr]` hero-weighted layout with mobile reordering -- this is
 * one section among several on a page that already has its own summary
 * strip and attention list, not a dedicated full-page hero. The current
 * shift still gets `ShiftSnapshotCard`'s own built-in "hero" visual
 * treatment (bigger surface, live `ShiftProgress`) and simply occupies its
 * one-third share of the row, which is enough to read as the visually
 * "current" card without dominating the page. Natural chronological
 * order (previous, current, next) is kept in BOTH DOM order and visual
 * order, on mobile and desktop alike -- no special "current-first"
 * reordering, since that was a Home-screen-specific choice this compact
 * section doesn't need.
 */
export function ManagerShiftSnapshotSection({ snapshot, todayDate, fetchedAt }: ManagerShiftSnapshotSectionProps) {
  return (
    <div>
      <h2 className="mb-3 text-base font-semibold text-foreground">תמונת מצב משמרות</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ShiftSnapshotCard label="הקודמת" shift={snapshot.previousShift} todayDate={todayDate} />
        <ShiftSnapshotCard
          label="עכשיו"
          shift={snapshot.currentShift}
          todayDate={todayDate}
          current={{ timing: snapshot.currentShift.timing, fetchedAt }}
        />
        <ShiftSnapshotCard label="הבאה" shift={snapshot.nextShift} todayDate={todayDate} />
      </div>
    </div>
  );
}
