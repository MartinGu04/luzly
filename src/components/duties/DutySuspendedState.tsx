import { Panel } from "@/components/ui/Panel";

/**
 * Replaces `DutyFocusSection`'s "now/next" duty summary while Emergency
 * Mode is active (spec section 19/21) -- regular duties are suspended
 * system-wide for the whole duration (the global `EmergencyModeBanner`
 * already says so once, app-wide), so showing a "currently on duty"/
 * "next duty" hero here would imply a regular operational reality that
 * is not currently true. A calm, factual state -- the SAME neutral tone
 * `dutyPace.ts`'s own `"suspended"` pace status uses -- never a warning/
 * critical tint; this is an expected, temporary system state, not an
 * error.
 */
export function DutySuspendedState() {
  return (
    <Panel variant="hero" className="text-center sm:text-start" data-testid="duties-suspended-state">
      <span aria-hidden="true" className="text-3xl">
        ⏸️
      </span>
      <p className="mt-3 text-base font-semibold text-foreground">תורנויות רגילות מושהות</p>
      <p className="mt-1.5 text-sm text-muted">
        מצב חירום פעיל, ולכן אין כרגע תורנות פעילה או קרובה להצגה. התורנויות הרגילות יתחדשו לאחר סיום מצב החירום.
      </p>
    </Panel>
  );
}
