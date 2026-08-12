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
          <p className="truncate text-sm font-medium text-white">{name}</p>
          {isManager ? <p className="text-[11px] text-sidebar-muted">מנהל/ת</p> : null}
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="התנתקות"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-muted transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <LogOut className="h-[17px] w-[17px]" aria-hidden="true" strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </div>
  );
}
