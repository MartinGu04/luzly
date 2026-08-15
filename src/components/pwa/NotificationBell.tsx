"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, RefreshCw } from "lucide-react";
import { usePushSubscription } from "./usePushSubscription";

interface NotificationBellProps {
  /** Only affects the trigger button's own visual treatment -- the popover panel itself looks identical in both contexts. */
  variant: "sidebar" | "mobile";
}

const TRIGGER_CLASSES: Record<NotificationBellProps["variant"], string> = {
  sidebar:
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
  mobile:
    "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-overlay-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
};

/**
 * The real notification control (PR #29), replacing the "בקרוב"
 * placeholder bell from PR #28 in both `Sidebar` (desktop) and
 * `MobileIdentityBar` (mobile) -- the exact spot both already reserved
 * for this feature. A compact popover, matching `MobileProfileMenu`'s
 * existing click-outside/Escape-to-dismiss pattern, rather than a new
 * main navigation entry.
 *
 * All state/actions live in `usePushSubscription` -- this component is
 * presentation + the popover's open/close/dismiss mechanics only.
 */
export function NotificationBell({ variant }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const { state, errorMessage, testStatus, enable, disable, sendTest } = usePushSubscription();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const isEnabled = state === "enabled" || state === "disabling";
  const TriggerIcon = isEnabled ? BellRing : Bell;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={isEnabled ? "התראות פעילות" : "התראות"}
        onClick={() => setOpen((prev) => !prev)}
        className={TRIGGER_CLASSES[variant]}
      >
        <TriggerIcon className="h-[16px] w-[16px]" aria-hidden="true" strokeWidth={1.75} />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="הגדרות התראות"
          className="absolute end-0 top-full z-50 mt-2 w-72 rounded-2xl bg-surface-1 p-4 text-foreground shadow-[var(--shadow-hero)] ring-1 ring-border-strong"
        >
          {state === "checking" ? <CheckingPanel /> : null}
          {state === "unsupported" ? <UnsupportedPanel /> : null}
          {state === "permission_denied" ? <PermissionDeniedPanel /> : null}
          {state === "not_enabled" || state === "enabling" ? (
            <NotEnabledPanel pending={state === "enabling"} errorMessage={errorMessage} onEnable={enable} />
          ) : null}
          {state === "enabled" || state === "disabling" ? (
            <EnabledPanel
              disabling={state === "disabling"}
              testStatus={testStatus}
              onDisable={disable}
              onSendTest={sendTest}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CheckingPanel() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" strokeWidth={1.75} />
      בודק סטטוס התראות...
    </div>
  );
}

function UnsupportedPanel() {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">התראות</p>
      <p className="mt-1 text-xs text-muted">התראות אינן נתמכות בדפדפן או במכשיר הזה.</p>
    </div>
  );
}

function PermissionDeniedPanel() {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">התראות חסומות</p>
      <p className="mt-1 text-xs text-muted">
        ההתראות חסומות בהגדרות הדפדפן או המערכת. כדי להפעיל אותן, יש לאשר התראות עבור האתר בהגדרות ולנסות שוב.
      </p>
    </div>
  );
}

function NotEnabledPanel({
  pending,
  errorMessage,
  onEnable,
}: {
  pending: boolean;
  errorMessage: string | null;
  onEnable: () => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">התראות</p>
      <p className="mt-1 text-xs text-muted">קבל תזכורות ועדכונים חשובים ממי-מה-מו</p>
      <button
        type="button"
        onClick={onEnable}
        disabled={pending}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" strokeWidth={1.75} /> : null}
        {pending ? "מפעיל..." : "הפעל התראות"}
      </button>
      {errorMessage ? <p className="mt-2 text-xs text-critical">{errorMessage}</p> : null}
    </div>
  );
}

function EnabledPanel({
  disabling,
  testStatus,
  onDisable,
  onSendTest,
}: {
  disabling: boolean;
  testStatus: "idle" | "pending" | "success" | "error";
  onDisable: () => void;
  onSendTest: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4 text-primary" aria-hidden="true" strokeWidth={1.75} />
        <p className="text-sm font-semibold text-foreground">התראות פעילות</p>
      </div>

      <button
        type="button"
        onClick={onSendTest}
        disabled={testStatus === "pending" || disabling}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border-strong px-3 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-overlay-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70"
      >
        {testStatus === "pending" ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" strokeWidth={2} />
        ) : null}
        שלח התראת בדיקה
      </button>
      {testStatus === "success" ? <p className="mt-1.5 text-xs text-success">ההתראה נשלחה בהצלחה.</p> : null}
      {testStatus === "error" ? (
        <p className="mt-1.5 text-xs text-critical">שליחת ההתראה נכשלה. נסו שוב.</p>
      ) : null}

      <button
        type="button"
        onClick={onDisable}
        disabled={disabling}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-critical transition-colors duration-200 hover:bg-critical/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical disabled:cursor-not-allowed disabled:opacity-70"
      >
        {disabling ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" strokeWidth={1.75} />
        ) : (
          <BellOff className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
        )}
        {disabling ? "מכבה..." : "כבה התראות"}
      </button>
    </div>
  );
}
