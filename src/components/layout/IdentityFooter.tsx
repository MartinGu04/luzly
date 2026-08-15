import { signOutAction } from "@/lib/auth/actions";
import { Avatar } from "@/components/ui/Avatar";
import { APP_VERSION } from "@/lib/config/appVersion";
import { IdentityFooterSignOutButton } from "./IdentityFooterSignOutButton";
import { IdentityFooterThemeAction } from "./IdentityFooterThemeAction";

interface IdentityFooterProps {
  name: string;
  isManager: boolean;
  /** Presentation-only Google account photo -- see `lib/auth/currentUser.ts`. `null` falls back to initials in `Avatar`. */
  avatarUrl: string | null;
}

/**
 * Identity card for the protected shell: avatar, name, manager indication,
 * sign out, app version, and (sidebar/mobile-nav refinement pass) the
 * theme control -- moved here from a top-of-rail utility row so it reads
 * as part of the account/personal controls next to the user block instead
 * of a stray toggle above the nav list. This is the ONLY theme control in
 * the sidebar; `Sidebar` itself renders none, and it's a single compact
 * light/dark action (`IdentityFooterThemeAction`), not the 3-option
 * `ThemeToggle`.
 */
export function IdentityFooter({ name, isManager, avatarUrl }: IdentityFooterProps) {
  return (
    <div className="border-t border-sidebar-border px-5 py-5">
      <div className="flex items-center gap-3 rounded-xl px-1 py-1.5">
        <Avatar name={name} size="md" avatarUrl={avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-sidebar-foreground">{name}</p>
          {isManager ? <p className="text-xs text-sidebar-muted">מנהל/ת</p> : null}
        </div>
        <form action={signOutAction}>
          <IdentityFooterSignOutButton />
        </form>
      </div>
      <div className="mt-3.5 flex items-center justify-between gap-2 px-1">
        <IdentityFooterThemeAction />
        <p className="text-[11px] text-sidebar-muted">גרסה {APP_VERSION}</p>
      </div>
    </div>
  );
}
