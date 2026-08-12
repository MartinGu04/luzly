import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { Avatar } from "@/components/ui/Avatar";

interface IdentityFooterProps {
  name: string;
  isManager: boolean;
}

/** Identity affordance for the protected shell: avatar, name, manager indication, sign out. No email. */
export function IdentityFooter({ name, isManager }: IdentityFooterProps) {
  return (
    <div className="border-t border-sidebar-border px-3 py-4">
      <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{name}</p>
          {isManager ? <p className="text-[11px] text-sidebar-muted">מנהל/ת</p> : null}
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="התנתקות"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-critical/80 transition-colors duration-200 hover:bg-critical/10 hover:text-critical focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical"
          >
            <LogOut className="h-[17px] w-[17px]" aria-hidden="true" strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </div>
  );
}
