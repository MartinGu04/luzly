import Link from "next/link";
import { buildManagerHref, type ManagerCategory, type ManagerHrefParams } from "@/lib/presentation/managerUrl";

interface ManagerCategoryNavProps {
  active: ManagerCategory;
  /** The manager's current range/month URL state, preserved across category switches -- same `ManagerHrefParams` convention `ManagerRangeSelector`/`ManagerRosterSection` already use. `personId` is deliberately never read from here: every category is a whole-team view, so switching category always leaves any person drill-down. */
  current: Omit<ManagerHrefParams, "personId" | "category">;
}

const CATEGORY_OPTIONS: { key: ManagerCategory; label: string }[] = [
  { key: "overview", label: "סקירה" },
  { key: "shifts", label: "משמרות" },
  { key: "personnel", label: "כוח אדם" },
  { key: "duties", label: "תורנויות והיעדרויות" },
  { key: "logins", label: "התחברויות והתראות" },
];

const TAB_BASE =
  "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * The Manager Area's top-level category switch (redesign) -- "סקירה"
 * (Overview, the default command-center view), "משמרות" (coverage +
 * Potential reconciliation), "כוח אדם" (roster + person drill-down),
 * "תורנויות והיעדרויות" (cross-team duties/absences), "התחברויות והתראות"
 * (login/notification adoption). Real, server-rendered `Link`s (same idiom
 * `FairnessModeToggle`/`DutyViewToggle` already use), never client-only tab
 * state, so every category stays directly linkable/shareable/back-button-
 * safe. `role="tablist"` gives the selected state an accessible name beyond
 * color alone.
 *
 * All five tabs stay on ONE row, always -- `whitespace-nowrap` on each tab
 * (a two-word Hebrew label like "תורנויות והיעדרויות"/"התחברויות והתראות"
 * would otherwise be free to break at its internal space once squeezed,
 * which reads as that tab detaching onto its own row rather than staying
 * part of the strip) combined with `shrink-0` means no tab can shrink below
 * its own full label width, so the `inline-flex` tablist's shrink-to-fit
 * width is always its natural full content width -- on a narrow viewport
 * that exceeds the `nav`'s own width, which is exactly what makes
 * `overflow-x-auto` on the `nav` kick in as horizontal scroll instead of a
 * wrapped second row. Desktop is unaffected: the strip already fits on one
 * row there with no scrolling needed.
 */
export function ManagerCategoryNav({ active, current }: ManagerCategoryNavProps) {
  return (
    <nav aria-label="קטגוריות אזור מנהל" className="-mx-1 overflow-x-auto px-1">
      <div role="tablist" className="inline-flex items-center gap-1 rounded-full bg-overlay-soft p-1">
        {CATEGORY_OPTIONS.map((option) => {
          const isActive = active === option.key;
          return (
            <Link
              key={option.key}
              href={buildManagerHref({ ...current, personId: null, category: option.key })}
              role="tab"
              aria-selected={isActive}
              className={`${TAB_BASE} ${
                isActive ? "bg-surface-1 text-primary ring-1 ring-border" : "text-muted hover:text-foreground"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
