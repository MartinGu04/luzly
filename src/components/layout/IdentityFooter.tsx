import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { Avatar } from "@/components/ui/Avatar";
import { APP_VERSION } from "@/lib/config/appVersion";

interface IdentityFooterProps {
  name: string;
  isManager: boolean;
}

/**
 * Identity card for the protected shell: avatar, name, manager indication,
 * sign out, app version. No email, ever -- the request-scoped read model
 * already strips it before this component sees `name`/`isManager`, and
 * `APP_VERSION` is sourced from `package.json` (never hardcoded), so this
 * is the honest, always-in-sync version string.
 */
export function IdentityFooter({ name, isManager }: IdentityFooterProps) {
  return (
    <div className="border-t border-sidebar-border px-4 py-4">
      <div className="flex items-center gap-3 rounded-xl px-1 py-1.5">
        <Avatar name={name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-sidebar-foreground">{name}</p>
          {isManager ? <p className="text-xs text-sidebar-muted">מנהל/ת</p> : null}
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="התנתקות"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-critical/80 transition-colors duration-200 hover:bg-critical/10 hover:text-critical focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical"
          >
            <LogOut className="h-[17px] w-[17px]" aria-hidden="true" strokeWidth={1.75} />
          </button>
        </form>
      </div>
      <p className="mt-2.5 px-1 text-[11px] text-sidebar-muted">גרסה {APP_VERSION}</p>
    </div>
  );
}
