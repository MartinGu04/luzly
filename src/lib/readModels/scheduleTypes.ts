import type { LocalNow } from "@/lib/domain/localNow";
import type { ManagerAbsenceEntry, ManagerDutyEntry, ManagerShiftOverviewEntry } from "./managerTypes";
import type { PersonalScheduleReadModel } from "./types";

/**
 * Which question `/schedule` is currently answering (PR #24):
 * - "self" -- "what does MY schedule look like?" (every normal user, always;
 *   a manager's own default).
 * - "person" -- "what does THIS person's schedule look like?" (manager only).
 * - "all" -- "what does the whole team's staffing look like?" (manager only).
 */
export type SchedulePerspective = "self" | "all" | "person";

/** The only shape the manager perspective selector ever receives -- never a full `Person`, never email. */
export interface ScheduleRosterOption {
  id: string;
  name: string;
}

/**
 * Everyone-mode's team staffing projection for the displayed calendar
 * month -- deliberately typed, not `PersonalEventView[]` dumped into a
 * grid (PR #24 §14). Reuses the EXACT same `ManagerShiftOverviewEntry`/
 * `ManagerDutyEntry`/`ManagerAbsenceEntry` shapes (and the coverage/duty/
 * absence semantics behind them) Manager Overview already renders --
 * scoped here to the displayed month instead of an arbitrary manager date
 * range, and built from the SAME in-memory manager snapshot (never a
 * second Google fetch, never per-date/per-person reimplementation).
 */
export interface ScheduleEveryoneReadModel {
  staffing: ManagerShiftOverviewEntry[];
  duties: ManagerDutyEntry[];
  absences: ManagerAbsenceEntry[];
}

/**
 * The full server-computed `/schedule` read model -- safe to serialize to
 * the authenticated user's own browser session. For a normal user,
 * `manager`/`roster` are always null/empty and `perspective` is always
 * "self" -- the exact same shape a manager's own default self view uses,
 * so a normal user's rendered page is byte-for-byte the pre-PR-24
 * personal Schedule experience. Never carries `sourceSheet`/`sourceCell`,
 * raw workbook objects, colleague email, or any `Person` beyond the safe
 * `PersonalProfile`/`ScheduleRosterOption` projections already used
 * elsewhere in this layer.
 */
export interface ScheduleReadModel {
  fetchedAt: string;
  localNow: LocalNow;

  /** Null for a normal (non-manager) user -- the manager selector must never render. */
  manager: { id: string; name: string } | null;
  /** The manager-visible roster for the selector, EXCLUDING the manager's own entry (they already have the explicit "אני" option). Always empty for a normal user. */
  roster: ScheduleRosterOption[];

  perspective: SchedulePerspective;
  /** Set only when `perspective === "person"`. */
  selectedPersonId: string | null;
  selectedPersonName: string | null;

  /**
   * Set for `perspective` "self" or "person" -- the exact same
   * `PersonalScheduleReadModel` shape `/schedule` already renders for the
   * authenticated user, reused outright for a selected person too (see
   * `buildScheduleReadModel.ts`). Null in "all" scope.
   */
  personal: PersonalScheduleReadModel | null;

  /** Set only for `perspective === "all"`. Null otherwise. */
  everyone: ScheduleEveryoneReadModel | null;
}
