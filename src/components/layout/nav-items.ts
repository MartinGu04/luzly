import { CalendarDays, LayoutDashboard, ShieldCheck, UserCog, type LucideIcon } from "lucide-react";

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
   * True only for `/manager`. Authorization is enforced server-side by the
   * manager loader regardless of this flag — this only controls whether the
   * link is shown at all. A non-manager must never see it, not even as a
   * disabled/"coming soon" placeholder (unlike the genuinely-future routes
   * below), so callers filter it out entirely rather than rendering it
   * disabled. Deliberately excluded from `inBottomNav` — the mobile
   * shortcut lives in `MobileIdentityBar` instead, so the five-item
   * BottomNav never grows a sixth entry.
   */
  managerOnly?: boolean;
}

// "dashboard", "schedule", "duties", and "manager" (manager-only) are all
// real, working routes -- every current item is a live link, none are
// disabled "coming soon" placeholders. "תזכורות" was removed from here
// (Design Pass, sidebar/mobile-nav refinement pass): that area now belongs
// to the notification bell flow instead of a permanent nav slot, and there
// was never a real /reminders route behind it. "מי איתי" and "התנגשויות"
// were removed as standalone destinations (nav/people-selector consolidation
// pass): "מי איתי" now lives only in its existing dashboard presentation
// (`CounterpartPanel`, unchanged), and conflict/coverage detection now
// surfaces through the manager's unified "דורש טיפול" section
// (`ManagerAttentionSection`) instead of a separate technical page -- the
// underlying detection logic (`detectOperationalIssues`) is untouched.
export const navItems: NavItem[] = [
  { label: "לוח בקרה", shortLabel: "היום שלי", href: "/", enabled: true, icon: LayoutDashboard, inBottomNav: true },
  { label: "הלוח שלי", shortLabel: "הלוח שלי", href: "/schedule", enabled: true, icon: CalendarDays, inBottomNav: true },
  { label: "תורנויות", shortLabel: "תורנויות", href: "/duties", enabled: true, icon: ShieldCheck, inBottomNav: true },
  { label: "אזור מנהל", shortLabel: "מנהל", href: "/manager", enabled: true, icon: UserCog, inBottomNav: false, managerOnly: true },
];

/** The nav items a given viewer may see at all -- `managerOnly` items are omitted entirely (never shown disabled) for a non-manager. */
export function visibleNavItems(isManager: boolean): NavItem[] {
  return navItems.filter((item) => !item.managerOnly || isManager);
}
