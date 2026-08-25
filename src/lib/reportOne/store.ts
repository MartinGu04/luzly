import "server-only";
import { getReportOneReserveInclusionServiceClient } from "./serviceClient";

interface ReserveInclusionRow {
  person_id: string;
  included: boolean;
}

/**
 * Explicit saved preferences ONLY, for exactly the given `personIds` --
 * a person with no row here has NEVER had a preference saved. The
 * caller (never this function) decides the default (`true`, per this
 * feature's spec -- see `lib/readModels/reportOneTomorrow.ts`) for
 * anyone missing from the returned map, so the very first use of this
 * feature is a no-op (every reserve person stays included exactly as
 * they are today).
 */
export async function getReserveInclusionPreferences(personIds: readonly string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (personIds.length === 0) return result;

  const supabase = getReportOneReserveInclusionServiceClient();
  const { data, error } = await supabase
    .from("report_one_reserve_inclusion")
    .select("person_id, included")
    .in("person_id", personIds);
  if (error) throw error;

  for (const row of (data ?? []) as ReserveInclusionRow[]) {
    result.set(row.person_id, row.included);
  }
  return result;
}

/**
 * The ONE writer of `report_one_reserve_inclusion`. Always a full
 * upsert (never a partial patch) -- the caller
 * (`setReserveInclusionPreferenceAction`) has already re-validated
 * `personId` against a fresh roster as a genuine, currently-reserve
 * person before this is ever called. Last-write-wins is deliberate: a
 * saved preference represents the manager's current, explicit choice,
 * not a monotonic cursor like `dashboard_visit_state`'s own visit
 * timestamp -- there is no "moving backwards" concept here to guard
 * against.
 */
export async function setReserveInclusionPreference(
  personId: string,
  included: boolean,
  updatedByPersonId: string,
  updatedByPersonName: string,
): Promise<void> {
  const supabase = getReportOneReserveInclusionServiceClient();
  const { error } = await supabase.from("report_one_reserve_inclusion").upsert({
    person_id: personId,
    included,
    updated_at: new Date().toISOString(),
    updated_by_person_id: updatedByPersonId,
    updated_by_person_name: updatedByPersonName,
  });
  if (error) throw error;
}
