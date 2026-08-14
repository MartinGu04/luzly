import Link from "next/link";

export type ManagerSubNavKey = "overview" | "fairness";

interface ManagerSubNavProps {
  active: ManagerSubNavKey;
}

const ITEMS: { key: ManagerSubNavKey; label: string; href: string }[] = [
  { key: "overview", label: "סקירה", href: "/manager" },
  { key: "fairness", label: "טבלת צדק", href: "/manager/fairness" },
];

/**
 * Shared subnav between the manager's two screens (Design Pass PR #21 §4)
 * -- real, server-rendered `Link`s, never client-state tabs, so each screen
 * stays directly linkable/shareable/back-button-safe. `/manager/fairness`
 * is a manager sub-screen, not a sixth main navigation module, so it's not
 * added to `BottomNav`/`nav-items.ts` -- and it never carries its own
 * "מנהל" badge, since `ManagerHeader` already establishes the manager scope
 * once for both screens. `w-fit`/`self-start` guard against the pill
 * stretching to the full width of its `flex flex-col` page container
 * (the default cross-axis `stretch` alignment would otherwise size this
 * `nav` to 100% width even though it's internally `inline-flex`) --
 * without them the rounded pill background would span far past its two
 * links.
 */
export function ManagerSubNav({ active }: ManagerSubNavProps) {
  return (
    <nav
      aria-label="ניווט אזור מנהל"
      className="inline-flex w-fit shrink-0 items-center gap-1 self-start rounded-full bg-overlay-soft p-1"
    >
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ${
              isActive ? "bg-surface-1 text-primary shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
