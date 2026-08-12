import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { Avatar } from "@/components/ui/Avatar";

interface MobileIdentityBarProps {
  name: string;
  isManager: boolean;
}

/**
 * The only mobile sign-out affordance: below `lg`, `Sidebar` (and its
 * `IdentityFooter`) is hidden and `BottomNav` has no identity slot, so
 * without this a signed-in mobile user would have no way to sign out.
 * Uses only the already-safe name/isManager passed down from the app
 * shell (the same identity the request-scoped read model already
 * resolved) -- no email, no extra Google/auth fetch, no new route.
 */
export function MobileIdentityBar({ name, isManager }: MobileIdentityBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5 lg:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{name}</p>
          {isManager ? <p className="text-[10px] text-muted">מנהל/ת</p> : null}
        </div>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          aria-label="התנתקות"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-200 hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <LogOut className="h-[16px] w-[16px]" aria-hidden="true" strokeWidth={1.75} />
        </button>
      </form>
    </div>
  );
}
