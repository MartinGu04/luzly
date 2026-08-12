import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface MobileIdentityBarProps {
  name: string;
  isManager: boolean;
}

/**
 * The only mobile sign-out affordance: below `lg`, `Sidebar` (and its
 * `IdentityFooter`) is hidden and `BottomNav` has no identity slot, so
 * without this a signed-in mobile user would have no way to sign out.
 * Also the mobile home for the theme control (no new route, no drawer).
 * Uses only the already-safe name/isManager passed down from the app
 * shell (the same identity the request-scoped read model already
 * resolved) -- no email, no extra Google/auth fetch, no new route.
 */
export function MobileIdentityBar({ name, isManager }: MobileIdentityBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 lg:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{name}</p>
          {isManager ? <p className="text-[10px] text-muted">מנהל/ת</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeToggle />
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="התנתקות"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-critical/80 transition-colors duration-200 hover:bg-critical/10 hover:text-critical focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical"
          >
            <LogOut className="h-[16px] w-[16px]" aria-hidden="true" strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </div>
  );
}
