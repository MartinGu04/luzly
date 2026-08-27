import type { OperationalMode } from "@/lib/emergencyMode/types";

/**
 * The notification baseline's own "which operational SESSION is this"
 * identity (spec section 22) -- deliberately a NARROWER concept than
 * `OperationalMode` itself. Regular/emergency `kind` alone is what
 * `runReminders`/`runChangeDetection`'s fact-source selection still uses
 * (a regular-mode reminder stays a regular-mode reminder regardless of
 * which emergency session preceded it) -- this function exists ONLY to
 * give the notification baseline/source-transition safety check
 * (`pipeline.ts`'s `operationalGenerationTransitioned`) something finer
 * than `kind` to compare.
 *
 * Two DIFFERENT Emergency Mode activations are two different generations
 * even though both share `kind: "emergency"`: a worker tick that last
 * persisted `"emergency:<A.id>"`, then next observes Emergency Mode
 * active again but under a NEW period `B` (deactivated-then-reactivated
 * between ticks), must treat that exactly like any other transition --
 * never silently diff period B's real assignments against period A's
 * stale observed facts merely because both are "emergency". See the
 * `notification_baseline_state.last_operational_generation` migration's
 * own doc comment for the full false-notification scenario this
 * prevents.
 */
export function resolveOperationalGeneration(mode: OperationalMode): string {
  return mode.kind === "regular" ? "regular" : `emergency:${mode.period.id}`;
}
