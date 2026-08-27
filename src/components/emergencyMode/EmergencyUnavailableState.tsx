import { AlertTriangle } from "lucide-react";
import { Panel } from "@/components/ui/Panel";

/**
 * Rendered whenever Emergency Mode is active but its OWN workbook
 * cannot be configured/read/parsed (spec section 4/29) -- a distinct
 * state from the regular `ConfigurationErrorState` (which is about the
 * REGULAR shift-time setting). The system must never silently fall back
 * to regular shift data while claiming Emergency Mode is active, so
 * every emergency-aware page renders this instead in that case.
 */
export function EmergencyUnavailableState() {
  return (
    <Panel variant="critical" className="animate-fade-up text-center sm:text-start">
      <AlertTriangle className="mx-auto h-6 w-6 text-critical sm:mx-0" aria-hidden="true" strokeWidth={1.75} />
      <h2 className="mt-3 text-xl font-semibold text-foreground">🚨 מצב חירום פעיל — נתוני החירום אינם זמינים</h2>
      <p className="mt-1.5 text-sm text-muted">
        לא ניתן לטעון כרגע את סידור החירום. המערכת אינה מציגה נתוני משמרות רגילות במקומם. נסה/י שוב מאוחר יותר או פנה/י למנהל.
      </p>
    </Panel>
  );
}
