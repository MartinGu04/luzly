import { resolveOperationalMode } from "@/lib/emergencyMode/state";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { EmergencyModeControlClient } from "./EmergencyModeControlClient";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Formats an activation/deactivation INSTANT for manager-facing display
 * ("הופעל 26/08/2026, 14:00") -- computed server-side via
 * `getJerusalemLocalNow(instant)`, the one place allowed to turn a real
 * instant into an Asia/Jerusalem civil reading (see that function's own
 * docs). The client component below only ever receives this already-
 * formatted string, never a raw ISO instant/`Date` to reformat itself --
 * avoids any risk of a server/client hydration mismatch from two
 * independent `Intl` calls.
 */
function formatInstantForDisplay(iso: string): string {
  const { date, minuteOfDay } = getJerusalemLocalNow(new Date(iso));
  const [year, month, day] = date.split("-");
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${day}/${month}/${year}, ${pad2(hour)}:${pad2(minute)}`;
}

/**
 * The system-level, manual Emergency Mode activation/deactivation
 * control (spec section 2) -- placed directly beneath `ManagerHeader`,
 * before `ManagerCategoryNav`, so it applies to the whole system rather
 * than living inside one manager category. Resolves the live
 * `OperationalMode` itself (request-scoped `cache()`, see
 * `lib/emergencyMode/state.ts`) so every render of `/manager` reflects
 * genuinely current state, never a stale prop threaded through the rest
 * of the page's own (differently-cached) read model.
 */
export async function EmergencyModeControl() {
  const mode = await resolveOperationalMode();

  if (mode.kind === "regular") {
    return <EmergencyModeControlClient mode={{ kind: "regular" }} />;
  }

  return (
    <EmergencyModeControlClient
      mode={{
        kind: "emergency",
        activatedAtDisplay: formatInstantForDisplay(mode.period.activatedAt),
        activatedByPersonName: mode.period.activatedByPersonName,
      }}
    />
  );
}
