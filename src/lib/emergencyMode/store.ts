import "server-only";
import { getEmergencyModeServiceClient } from "./serviceClient";
import type {
  EmergencyModeActivationStatus,
  EmergencyModeDeactivationStatus,
  EmergencyModePeriod,
} from "./types";

interface EmergencyModePeriodDbRow {
  id: string;
  activated_at: string;
  activated_by_user_id: string;
  activated_by_person_id: string;
  activated_by_person_name: string;
  start_date: string;
  deactivated_at: string | null;
  deactivated_by_user_id: string | null;
  deactivated_by_person_id: string | null;
  deactivated_by_person_name: string | null;
  end_date: string | null;
}

function fromDbRow(row: EmergencyModePeriodDbRow): EmergencyModePeriod {
  return {
    id: row.id,
    activatedAt: row.activated_at,
    activatedByUserId: row.activated_by_user_id,
    activatedByPersonId: row.activated_by_person_id,
    activatedByPersonName: row.activated_by_person_name,
    startDate: row.start_date,
    deactivatedAt: row.deactivated_at,
    deactivatedByUserId: row.deactivated_by_user_id,
    deactivatedByPersonId: row.deactivated_by_person_id,
    deactivatedByPersonName: row.deactivated_by_person_name,
    endDate: row.end_date,
  };
}

const PERIOD_COLUMNS =
  "id, activated_at, activated_by_user_id, activated_by_person_id, activated_by_person_name, start_date, deactivated_at, deactivated_by_user_id, deactivated_by_person_id, deactivated_by_person_name, end_date";

/** The currently active period, or `null` if Emergency Mode is off. A plain read -- no locking, safe to call as often as needed. */
export async function getActiveEmergencyModePeriod(): Promise<EmergencyModePeriod | null> {
  const supabase = getEmergencyModeServiceClient();
  const { data, error } = await supabase
    .from("emergency_mode_periods")
    .select(PERIOD_COLUMNS)
    .is("deactivated_at", null)
    .maybeSingle();
  if (error) throw error;

  return data ? fromDbRow(data as EmergencyModePeriodDbRow) : null;
}

/** Every activation period ever recorded, most recent first -- the full audit history, used to build the "which calendar dates are emergency dates" set for fairness exclusion (section 18/19 of the spec). */
export async function getAllEmergencyModePeriods(): Promise<EmergencyModePeriod[]> {
  const supabase = getEmergencyModeServiceClient();
  const { data, error } = await supabase
    .from("emergency_mode_periods")
    .select(PERIOD_COLUMNS)
    .order("activated_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as EmergencyModePeriodDbRow[]).map(fromDbRow);
}

export interface ActivateEmergencyModeResult {
  status: EmergencyModeActivationStatus;
  periodId: string;
  activatedAt: string;
}

interface ActivateEmergencyModeRpcRow {
  status: EmergencyModeActivationStatus;
  period_id: string;
  activated_at: string;
}

/**
 * The ONE call site of the `activate_emergency_mode` RPC
 * (`supabase/migrations/20260826100000_add_emergency_mode_rpcs.sql`) --
 * atomic, idempotent activation. Two managers double-clicking "הפעל מצב
 * חירום" concurrently can never both create an active period: the RPC's
 * `select ... for update` on the singleton `emergency_mode_state` row
 * serializes them, so exactly one call gets `status: "activated"` and
 * the other gets `status: "already_active"` referencing the SAME period
 * the first call just created.
 */
export async function activateEmergencyMode(
  userId: string,
  personId: string,
  personName: string,
  startDate: string,
): Promise<ActivateEmergencyModeResult> {
  const supabase = getEmergencyModeServiceClient();
  const { data, error } = await supabase
    .rpc("activate_emergency_mode", {
      p_user_id: userId,
      p_person_id: personId,
      p_person_name: personName,
      p_start_date: startDate,
    })
    .single<ActivateEmergencyModeRpcRow>();
  if (error || !data) throw error ?? new Error("activate_emergency_mode returned no row");

  return { status: data.status, periodId: data.period_id, activatedAt: data.activated_at };
}

export interface DeactivateEmergencyModeResult {
  status: EmergencyModeDeactivationStatus;
  periodId: string | null;
  deactivatedAt: string | null;
}

interface DeactivateEmergencyModeRpcRow {
  status: EmergencyModeDeactivationStatus;
  period_id: string | null;
  deactivated_at: string | null;
}

/**
 * The ONE call site of the `deactivate_emergency_mode` RPC -- same
 * atomicity/idempotency guarantee as `activateEmergencyMode` above, in
 * reverse: two managers double-clicking "סיים מצב חירום" concurrently
 * can never both close (or corrupt) the same period.
 */
export async function deactivateEmergencyMode(
  userId: string,
  personId: string,
  personName: string,
  endDate: string,
): Promise<DeactivateEmergencyModeResult> {
  const supabase = getEmergencyModeServiceClient();
  const { data, error } = await supabase
    .rpc("deactivate_emergency_mode", {
      p_user_id: userId,
      p_person_id: personId,
      p_person_name: personName,
      p_end_date: endDate,
    })
    .single<DeactivateEmergencyModeRpcRow>();
  if (error || !data) throw error ?? new Error("deactivate_emergency_mode returned no row");

  return { status: data.status, periodId: data.period_id, deactivatedAt: data.deactivated_at };
}
