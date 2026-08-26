import "server-only";
import { resolveOperationalMode } from "@/lib/emergencyMode/state";
import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";
import type { EmergencyAssignment } from "@/lib/domain/emergencyShift";
import type { EmergencyParseDiagnostic } from "@/lib/parsers/emergencySchedule";
import type { Person } from "@/lib/domain/types";
import { loadEmergencyRoster } from "./emergencyRoster";

/**
 * The central, explicit "which operational world is live, and what's
 * the roster" read model -- spec section 30's "central mode-aware
 * read/orchestration boundary" every emergency-aware read model builds
 * on, instead of scattering ad-hoc `if (emergency)` checks and each
 * re-implementing the fetch/fail-safe sequence independently.
 *
 * `"emergency_unavailable"` is a DISTINCT outcome from `"regular"` --
 * callers must render a visible configuration-error/unavailable state
 * for it, never quietly reuse regular Schedule data (spec section 4/29:
 * "NEVER silently fall back to regular shift assignments while the
 * system claims Emergency Mode is active").
 */
export type OperationalRoster =
  | { mode: "regular" }
  | {
      mode: "emergency";
      period: EmergencyModePeriod;
      assignments: EmergencyAssignment[];
      diagnostics: EmergencyParseDiagnostic[];
      fetchedAt: string;
    }
  | { mode: "emergency_unavailable"; period: EmergencyModePeriod; message: string };

/**
 * Resolves the live `OperationalMode` (`lib/emergencyMode/state.ts`,
 * request-scoped, never the 30s workbook cache) and, only when
 * Emergency Mode is actually active, fetches+parses the emergency
 * roster (`loadEmergencyRoster`). While Emergency Mode is regular, the
 * emergency Google workbook is never fetched at all -- a missing/broken
 * `GOOGLE_EMERGENCY_SPREADSHEET_ID` has zero effect on this call.
 */
export async function resolveOperationalRoster(personnel: readonly Person[]): Promise<OperationalRoster> {
  const mode = await resolveOperationalMode();
  if (mode.kind === "regular") return { mode: "regular" };

  const roster = await loadEmergencyRoster(personnel);
  if (roster.status === "configuration_error") {
    return { mode: "emergency_unavailable", period: mode.period, message: roster.message };
  }

  return {
    mode: "emergency",
    period: mode.period,
    assignments: roster.assignments,
    diagnostics: roster.diagnostics,
    fetchedAt: roster.fetchedAt,
  };
}
