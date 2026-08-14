import {
  AlertTriangle,
  Bell,
  CalendarDays,
  LayoutDashboard,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

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

// "dashboard", "schedule", "duties", "with-me", "conflicts", and "manager"
// (manager-only) are real, working routes today. Everything else previews
// modules that will be built once further Google Sheets features exist, so
// they are rendered as disabled placeholders rather than dead links.
export const navItems: NavItem[] = [
  { label: "לוח בקרה", shortLabel: "היום שלי", href: "/", enabled: true, icon: LayoutDashboard, inBottomNav: true },
  { label: "לוח משמרות", shortLabel: "משמרות", href: "/schedule", enabled: true, icon: CalendarDays, inBottomNav: true },
  { label: "תורנויות", shortLabel: "תורנויות", href: "/duties", enabled: true, icon: ShieldCheck, inBottomNav: true },
  { label: "מי איתי", shortLabel: "מי איתי", href: "/with-me", enabled: true, icon: Users, inBottomNav: true },
  { label: "התנגשויות", shortLabel: "התנגשויות", href: "/conflicts", enabled: true, icon: AlertTriangle, inBottomNav: true },
  { label: "אזור מנהל", shortLabel: "מנהל", href: "/manager", enabled: true, icon: UserCog, inBottomNav: false, managerOnly: true },
  { label: "תזכורות", shortLabel: "תזכורות", href: "/reminders", enabled: false, icon: Bell, inBottomNav: false },
];

/** The nav items a given viewer may see at all -- `managerOnly` items are omitted entirely (never shown disabled) for a non-manager. */
export function visibleNavItems(isManager: boolean): NavItem[] {
  return navItems.filter((item) => !item.managerOnly || isManager);
}
