"use client";

import { useState, useTransition } from "react";
import { Panel } from "@/components/ui/Panel";
import { activateEmergencyModeAction, deactivateEmergencyModeAction } from "@/lib/emergencyMode/actions";

export type EmergencyModeControlProjection =
  | { kind: "regular" }
  | { kind: "emergency"; activatedAtDisplay: string; activatedByPersonName: string };

interface EmergencyModeControlClientProps {
  mode: EmergencyModeControlProjection;
}

const GENERIC_ERROR = "משהו השתבש. נסה/י שוב.";

/**
 * The manager-facing Emergency Mode toggle UI (spec section 2). No
 * modal/`Dialog` component exists in this codebase (see
 * `ManagerScheduledBroadcastsSection.tsx`'s "לבטל את התזמון?" inline
 * reveal) -- the confirmation step here follows that SAME established
 * idiom (local `useState` reveal, never `window.confirm`), just with the
 * fuller title+body+button copy the spec calls for. The FIRST click
 * never mutates anything; only the explicit "כן, ..." confirm button
 * calls the Server Action.
 */
export function EmergencyModeControlClient({ mode }: EmergencyModeControlClientProps) {
  const [confirmingActivate, setConfirmingActivate] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleActivate() {
    setError(null);
    startTransition(async () => {
      const result = await activateEmergencyModeAction();
      if (!result.ok) {
        setError(GENERIC_ERROR);
        return;
      }
      setConfirmingActivate(false);
    });
  }

  function handleDeactivate() {
    setError(null);
    startTransition(async () => {
      const result = await deactivateEmergencyModeAction();
      if (!result.ok) {
        setError(GENERIC_ERROR);
        return;
      }
      setConfirmingDeactivate(false);
    });
  }

  if (mode.kind === "emergency") {
    return (
      <Panel variant="critical" data-testid="emergency-mode-control">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-critical">🚨 מצב חירום פעיל</h2>
            <p className="mt-1 text-sm text-critical">המערכת פועלת לפי סידור משמרות החירום. תורנויות מושהות.</p>
            <p className="mt-2 text-xs text-critical/70">
              הופעל {mode.activatedAtDisplay}
              {mode.activatedByPersonName ? ` על ידי ${mode.activatedByPersonName}` : ""}
            </p>
          </div>
          {!confirmingDeactivate ? (
            <button
              type="button"
              onClick={() => setConfirmingDeactivate(true)}
              disabled={pending}
              className="shrink-0 rounded-full bg-critical px-4 py-2 text-sm font-medium text-white hover:bg-critical/90 disabled:opacity-50"
            >
              סיים מצב חירום
            </button>
          ) : null}
        </div>

        {confirmingDeactivate ? (
          <div className="mt-4 rounded-lg bg-surface-1 p-4 ring-1 ring-border-strong" data-testid="emergency-mode-deactivate-confirm">
            <h3 className="text-sm font-semibold text-foreground">לסיים מצב חירום?</h3>
            <p className="mt-1 text-sm text-muted">המערכת תחזור לסידור הרגיל ותורנויות יחזרו לפעילות.</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={pending}
                className="rounded-full bg-critical px-4 py-2 text-sm font-medium text-white hover:bg-critical/90 disabled:opacity-50"
              >
                {pending ? "מבצע/ת…" : "כן, סיים מצב חירום"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDeactivate(false)}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted underline disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-2 text-xs text-critical">{error}</p> : null}
      </Panel>
    );
  }

  return (
    <Panel variant="panel" data-testid="emergency-mode-control">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">מצב חירום</h2>
          <p className="mt-1 text-sm text-muted">מעביר את המערכת לסידור משמרות חירום ומשהה תורנויות.</p>
        </div>
        {!confirmingActivate ? (
          <button
            type="button"
            onClick={() => setConfirmingActivate(true)}
            disabled={pending}
            className="shrink-0 rounded-full bg-critical/10 px-4 py-2 text-sm font-medium text-critical ring-1 ring-critical/25 hover:bg-critical/20 disabled:opacity-50"
          >
            הפעל מצב חירום
          </button>
        ) : null}
      </div>

      {confirmingActivate ? (
        <div className="mt-4 rounded-lg bg-surface-critical p-4 ring-1 ring-surface-critical-border" data-testid="emergency-mode-activate-confirm">
          <h3 className="text-sm font-semibold text-foreground">להפעיל מצב חירום?</h3>
          <p className="mt-1 text-sm text-muted">המערכת תעבור לסידור החירום. משמרות רגילות לא יוצגו ותורנויות יושהו.</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmingActivate(false)}
              disabled={pending}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted underline disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={handleActivate}
              disabled={pending}
              className="rounded-full bg-critical px-4 py-2 text-sm font-medium text-white hover:bg-critical/90 disabled:opacity-50"
            >
              {pending ? "מפעיל/ה…" : "כן, הפעל מצב חירום"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-critical">{error}</p> : null}
    </Panel>
  );
}
