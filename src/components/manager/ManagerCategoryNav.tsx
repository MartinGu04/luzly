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
  "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * The Manager Area's top-level category switch (redesign) -- "סקירה"
 * (Overview, the default command-center view), "משמרות" (coverage +
 * Potential reconciliation), "כוח אדם" (roster + person drill-down),
 * "תורנויות והיעדרויות" (cross-team duties/absences). Real, server-rendered
 * `Link`s (same idiom `FairnessModeToggle`/`DutyViewToggle` already use),
 * never client-only tab state, so every category stays directly linkable/
 * shareable/back-button-safe. `role="tablist"` gives the selected state an
 * accessible name beyond color alone.
 *
 * Always leaves a person drill-down when navigating (`personId` is never
 * threaded through) -- a category is a whole-team view, so "switch
 * category while inspecting one person" reads as "go look at the team's
 * X instead", never as "filter this person's own view by X".
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
