import { AlertTriangle } from "lucide-react";
import { LOGIN_ERROR_MESSAGE } from "@/lib/config/loginCopy";

/**
 * Redesigned replacement for what used to be no visible state at all --
 * `/auth/callback` has always redirected a failed exchange to
 * `/login?error=auth`, but the login page never read that param. Copy is
 * deliberately generic: never the underlying Supabase/provider error text.
 */
export function LoginErrorNotice({ className = "" }: { className?: string }) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-xl bg-surface-critical px-3.5 py-3 text-start text-sm text-foreground ring-1 ring-surface-critical-border ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden="true" strokeWidth={1.75} />
      <span>{LOGIN_ERROR_MESSAGE}</span>
    </div>
  );
}
