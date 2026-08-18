"use client";

import { RefreshCw } from "lucide-react";
import { APP_NAME } from "@/lib/config/productName";

interface UpdateNoticeProps {
  onUpdate: () => void;
  pending: boolean;
}

/**
 * A small, non-intrusive "new app version" toast (PR #28) -- shown ONLY
 * once `ServiceWorkerManager` confirms a genuinely NEW deployed build is
 * waiting (never on the very first install, never silently reloading on
 * its own). Deliberately separate from `DataFreshnessStatus`: „גרסה
 * חדשה" is about the deployed APPLICATION build; „רענון נתונים" is about
 * Google Sheets operational data. Two unrelated concepts that happen to
 * both live near the bottom of the screen.
 */
export function UpdateNotice({ onUpdate, pending }: UpdateNoticeProps) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-full border border-border-strong bg-surface-1 px-4 py-2.5 text-sm shadow-[var(--shadow-elevated)] lg:bottom-6"
    >
      <span className="text-foreground">גרסה חדשה של {APP_NAME} זמינה</span>
      <button
        type="button"
        onClick={onUpdate}
        disabled={pending}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" strokeWidth={2} /> : null}
        עדכון עכשיו
      </button>
    </div>
  );
}
