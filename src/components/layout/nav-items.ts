export interface NavItem {
  label: string;
  href: string;
  enabled: boolean;
}

// Only "dashboard" is a real, working route today. Everything else previews
// modules that will be built once Google Sheets parsing exists, so they are
// rendered as disabled placeholders rather than dead links.
export const navItems: NavItem[] = [
  { label: "לוח בקרה", href: "/", enabled: true },
  { label: "לוח משמרות", href: "/schedule", enabled: false },
  { label: "תורנויות", href: "/duties", enabled: false },
  { label: "מי איתי", href: "/with-me", enabled: false },
  { label: "התנגשויות", href: "/conflicts", enabled: false },
  { label: "מול מנהל", href: "/manager", enabled: false },
  { label: "תזכורות", href: "/reminders", enabled: false },
  { label: "סנכרון", href: "/sync", enabled: false },
];
