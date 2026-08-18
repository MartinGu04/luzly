import { AlertTriangle } from "lucide-react";
import { LOGIN_ERROR_MESSAGE } from "@/lib/config/loginCopy";

/**
 * Redesigned replacement for what used to be no visible state at all --
 * `/auth/callback` has always redirected a failed exchange to
 * `/login?error=auth`, but the login page never read that param. Copy is
 * deliberately generic: never the underlying Supabase/provider error text.
 */
/**
 * Fixed literal (never theme-responsive) styling, matching every other
 * piece of this route -- the login canvas is always dark regardless of the
 * app's light/dark preference (see `app/login/page.tsx`), so tokens like
 * `--foreground`/`--surface-critical` (which flip to LIGHT-theme values
 * whenever the visitor's stored preference is light) would render near-
 * invisible dark text on this always-dark canvas.
 */
export function LoginErrorNotice({ className = "" }: { className?: string }) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-xl bg-[#3a1518]/80 px-3.5 py-3 text-start text-sm text-white ring-1 ring-[#f77272]/30 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f77272]" aria-hidden="true" strokeWidth={1.75} />
      <span>{LOGIN_ERROR_MESSAGE}</span>
    </div>
  );
}
