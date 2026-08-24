import { BellRing, CalendarDays, LayoutDashboard, Scale, ShieldCheck, UserCog, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  /** Compact label for the bottom nav, where a full label may not fit. */
  shortLabel: string;
  href: string;
  enabled: boolean;
  icon: LucideIcon;
  /** Whether this item appears in the mobile bottom nav (kept to a small, uncluttered set). */
  inBottomNav: boolean;
  /**
   * True for `/manager` and `/notifications` -- both manager-only
   * destinations. Authorization is enforced server-side by each route's own
   * loader regardless of this flag — this only controls whether the link is
   * shown at all. A non-manager must never see either, not even as a
   * disabled/"coming soon" placeholder (unlike the genuinely-future routes
   * below), so callers filter them out entirely rather than rendering them
   * disabled. Deliberately excluded from `inBottomNav` — the mobile
   * shortcut for each lives in `MobileProfileMenu` instead, so the
   * four-item BottomNav never grows another entry.
   */
  managerOnly?: boolean;
}

// "dashboard", "schedule", "duties", "manager" (manager-only), and
// "notifications" (also manager-only) are all real, working routes --
// every current item is a live link, none are disabled "coming soon"
// placeholders. "תזכורות" was removed from here (Design Pass, sidebar/
// mobile-nav refinement pass): that area now belongs to the notification
// bell flow instead of a permanent nav slot, and there was never a real
// /reminders route behind it -- NOT to be confused with "מרכז התראות"
// (`/notifications`) below, a completely different, later-added Manager-only
// destination for SENDING/scheduling/history/recurring notification
// management, not the employee's own notification inbox. "מי איתי" and
// "התנגשויות" were removed as standalone destinations (nav/people-selector
// consolidation pass): "מי איתי" now lives only in its existing dashboard
// presentation (`CounterpartPanel`, unchanged), and conflict/coverage
// detection now surfaces through the manager's unified "דורש טיפול" section
// (`ManagerAttentionSection`) instead of a separate technical page -- the
// underlying detection logic (`detectOperationalIssues`) is untouched.
// PR #4 -- "טבלת צדק" (`/fairness`) joins as a real main-navigation
// destination, NOT manager-only: every mapped user, manager or not, can
// see and use it (unlike "/manager"/"/notifications", whose `managerOnly`
// flag stays unchanged). It replaces the old manager-only
// `/manager/fairness` sub-screen entirely -- see `ManagerSubNav` and
// `/manager/fairness`'s own redirect for the cleanup.
// "מרכז התראות" (`/notifications`) -- a standalone product surface split out
// of what used to be the Manager Area's combined "התחברויות והתראות"
// category: notification sending/scheduling/history/recurring-rule
// management moved here entirely, leaving that Manager category ("התחברויות")
// with only login/notification-readiness visibility. `/notifications` is its
// own top-level `managerOnly` destination, at the same nav level as
// "/manager" -- never rendered as a Manager Area subsection.
export const navItems: NavItem[] = [
  { label: "לוח בקרה", shortLabel: "היום שלי", href: "/", enabled: true, icon: LayoutDashboard, inBottomNav: true },
  { label: "הלוח שלי", shortLabel: "הלוח שלי", href: "/schedule", enabled: true, icon: CalendarDays, inBottomNav: true },
  { label: "תורנויות", shortLabel: "תורנויות", href: "/duties", enabled: true, icon: ShieldCheck, inBottomNav: true },
  { label: "טבלת צדק", shortLabel: "צדק", href: "/fairness", enabled: true, icon: Scale, inBottomNav: true },
  { label: "אזור מנהל", shortLabel: "מנהל", href: "/manager", enabled: true, icon: UserCog, inBottomNav: false, managerOnly: true },
  { label: "מרכז התראות", shortLabel: "התראות", href: "/notifications", enabled: true, icon: BellRing, inBottomNav: false, managerOnly: true },
];

/** The nav items a given viewer may see at all -- `managerOnly` items are omitted entirely (never shown disabled) for a non-manager. */
export function visibleNavItems(isManager: boolean): NavItem[] {
  return navItems.filter((item) => !item.managerOnly || isManager);
}
