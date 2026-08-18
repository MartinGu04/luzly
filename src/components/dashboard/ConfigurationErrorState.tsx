import { Settings2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";

/**
 * Rendered when the schedule loaded but the workbook's shift-time
 * configuration is invalid/missing (`ShiftConfigurationError`, surfaced as
 * `configuration_error`). The identity resolved fine -- only the
 * configuration is broken -- so this renders inside the normal app shell,
 * never the raw exception text.
 */
export function ConfigurationErrorState() {
  return (
    <Panel variant="hero" className="animate-fade-up text-center sm:text-start">
      <Settings2 className="mx-auto h-6 w-6 text-warning sm:mx-0" aria-hidden="true" strokeWidth={1.75} />
      <h2 className="mt-3 text-xl font-semibold text-foreground">לא ניתן לחשב כרגע את שעות המשמרות</h2>
      <p className="mt-1.5 text-sm text-muted">המערכת זיהתה בעיה בהגדרת הסידור. אפשר לנסות שוב מאוחר יותר.</p>
    </Panel>
  );
}
