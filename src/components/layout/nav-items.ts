import {
  AlertTriangle,
  Bell,
  CalendarDays,
  LayoutDashboard,
  RefreshCw,
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
}

// "dashboard", "schedule", "duties", "with-me", and "conflicts" are real,
// working routes today. Everything else previews modules that will be
// built once further Google Sheets features exist, so they are rendered
// as disabled placeholders rather than dead links.
export const navItems: NavItem[] = [
  { label: "לוח בקרה", shortLabel: "היום שלי", href: "/", enabled: true, icon: LayoutDashboard, inBottomNav: true },
  { label: "לוח משמרות", shortLabel: "משמרות", href: "/schedule", enabled: true, icon: CalendarDays, inBottomNav: true },
  { label: "תורנויות", shortLabel: "תורנויות", href: "/duties", enabled: true, icon: ShieldCheck, inBottomNav: true },
  { label: "מי איתי", shortLabel: "מי איתי", href: "/with-me", enabled: true, icon: Users, inBottomNav: true },
  { label: "התנגשויות", shortLabel: "בדיקות", href: "/conflicts", enabled: true, icon: AlertTriangle, inBottomNav: true },
  { label: "מול מנהל", shortLabel: "מנהל", href: "/manager", enabled: false, icon: UserCog, inBottomNav: false },
  { label: "תזכורות", shortLabel: "תזכורות", href: "/reminders", enabled: false, icon: Bell, inBottomNav: false },
  { label: "סנכרון", shortLabel: "סנכרון", href: "/sync", enabled: false, icon: RefreshCw, inBottomNav: false },
];
