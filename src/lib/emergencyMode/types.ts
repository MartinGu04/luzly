/**
 * The manual, system-level Emergency Mode domain types. Emergency Mode
 * is a GLOBAL operational-world switch, not a filter: while active, the
 * whole system's operational truth comes from the emergency shift
 * workbook (desk-based staffing) instead of the regular Schedule
 * workbook, and regular duties are suspended. See `src/lib/emergencyMode/README.md`
 * (if present) and the domain modules that consume `OperationalMode`
 * for how each feature branches on it.
 */

/** One activation/deactivation cycle -- see `emergency_mode_periods` migration for the exact column meanings this mirrors. */
export interface EmergencyModePeriod {
  id: string;
  /** Real instant Emergency Mode was switched on. */
  activatedAt: string;
  activatedByUserId: string;
  activatedByPersonId: string;
  activatedByPersonName: string;
  /** Asia/Jerusalem calendar date ("YYYY-MM-DD") Emergency Mode started on -- the WHOLE date is an emergency date, never a partial day. */
  startDate: string;
  /** Null while this period is still the currently active one. */
  deactivatedAt: string | null;
  deactivatedByUserId: string | null;
  deactivatedByPersonId: string | null;
  deactivatedByPersonName: string | null;
  /** Asia/Jerusalem calendar date Emergency Mode ended on -- null while still active. */
  endDate: string | null;
}

/**
 * The central, explicit "which operational world is live right now"
 * type -- read models and Server Actions branch on `mode.kind` instead
 * of scattering ad-hoc `if (emergency)` checks against a bare boolean.
 * See `src/lib/emergencyMode/state.ts` for the one function that
 * resolves this.
 */
export type OperationalMode =
  | { kind: "regular" }
  | { kind: "emergency"; period: EmergencyModePeriod };

export type EmergencyModeActivationStatus = "activated" | "already_active";
export type EmergencyModeDeactivationStatus = "deactivated" | "already_inactive";
