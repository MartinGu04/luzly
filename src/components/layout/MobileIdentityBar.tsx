import { BrandMark } from "@/components/brand/BrandMark";
import { NotificationBell } from "@/components/pwa/NotificationBell";
import { MobileProfileMenu } from "./MobileProfileMenu";

interface MobileIdentityBarProps {
  name: string;
  isManager: boolean;
  /** Presentation-only Google account photo -- see `lib/auth/currentUser.ts`. `null` falls back to initials. */
  avatarUrl: string | null;
}

/**
 * The mobile app header (Design Pass PR #22 "mobile header polish") --
 * replaces the old identity ROW (name, role, manager shortcut, 3-button
 * theme control, and logout all visible at once) with a clean product
 * header: the `BrandMark` (symbol + wordmark) on the physical right, and a compact
 * [Bell, Avatar] cluster on the physical left -- the Avatar is the single
 * entry point into everything the old row exposed permanently (identity,
 * "אזור מנהל" for a manager, theme, sign-out), now behind
 * `MobileProfileMenu`.
 *
 * Still the only mobile sign-out affordance (below `lg`, `Sidebar`/
 * `IdentityFooter` is hidden and `BottomNav` has no identity slot) and
 * still the mobile entry point to `/manager` (the five-item `BottomNav`
 * deliberately never grows a sixth entry for it) -- both now reached via
 * the profile menu instead of being permanently visible. The Bell is now
 * the real `NotificationBell` (PR #29) -- same spot the PR #28 "בקרוב"
 * placeholder reserved for it.
 *
 * Uses only the already-safe name/isManager passed down from the app
 * shell (the same identity the request-scoped read model already
 * resolved) -- no email, no extra Google/auth fetch.
 */
export function MobileIdentityBar({ name, isManager, avatarUrl }: MobileIdentityBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 lg:hidden">
      <BrandMark size="sm" className="text-foreground" />

      <div className="flex shrink-0 items-center gap-1.5">
        <NotificationBell variant="mobile" />
        <MobileProfileMenu name={name} isManager={isManager} avatarUrl={avatarUrl} />
      </div>
    </div>
  );
}
