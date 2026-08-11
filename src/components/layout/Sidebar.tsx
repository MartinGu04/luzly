import Link from "next/link";
import { navItems } from "./nav-items";

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <div className="px-6 py-6 text-xl font-bold text-white">Luzly</div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) =>
          item.enabled ? (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/10"
            >
              {item.label}
            </Link>
          ) : (
            <div
              key={item.href}
              aria-disabled="true"
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted"
            >
              <span>{item.label}</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-sidebar-muted">
                בקרוב
              </span>
            </div>
          ),
        )}
      </nav>
    </aside>
  );
}
