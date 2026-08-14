import { Bell } from "lucide-react";
import { APP_NAME } from "@/lib/config/productName";
import { MobileProfileMenu } from "./MobileProfileMenu";

interface MobileIdentityBarProps {
  name: string;
  isManager: boolean;
}

/**
 * The mobile app header (Design Pass PR #22 "mobile header polish") --
 * replaces the old identity ROW (name, role, manager shortcut, 3-button
 * theme control, and logout all visible at once) with a clean product
 * header: the `APP_NAME` wordmark on the physical right, and a compact
 * [Bell, Avatar] cluster on the physical left -- the Avatar is the single
 * entry point into everything the old row exposed permanently (identity,
 * "אזור מנהל" for a manager, theme, sign-out), now behind
 * `MobileProfileMenu`.
 *
 * Still the only mobile sign-out affordance (below `lg`, `Sidebar`/
 * `IdentityFooter` is hidden and `BottomNav` has no identity slot) and
 * still the mobile entry point to `/manager` (the five-item `BottomNav`
 * deliberately never grows a sixth entry for it) -- both now reached via
 * the profile menu instead of being permanently visible. The Bell is the
 * same "future affordance, no fake data" convention as the desktop
 * `Sidebar`'s own bell: disabled, no unread count, no new route/fetch.
 *
 * Uses only the already-safe name/isManager passed down from the app
 * shell (the same identity the request-scoped read model already
 * resolved) -- no email, no extra Google/auth fetch.
 */
export function MobileIdentityBar({ name, isManager }: MobileIdentityBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 lg:hidden">
      <span className="text-sm font-bold tracking-wide text-foreground">{APP_NAME}</span>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled
          aria-disabled="true"
          aria-label="התראות (בקרוב)"
          title="התראות -- בקרוב"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted opacity-60 disabled:cursor-not-allowed"
        >
          <Bell className="h-[16px] w-[16px]" aria-hidden="true" strokeWidth={1.75} />
        </button>
        <MobileProfileMenu name={name} isManager={isManager} />
      </div>
    </div>
  );
}
