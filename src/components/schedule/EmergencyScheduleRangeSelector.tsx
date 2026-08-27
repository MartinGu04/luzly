import Link from "next/link";
import { DEFAULT_EMERGENCY_SCHEDULE_RANGE, type EmergencyScheduleRangeKey } from "@/lib/presentation/emergencyAgenda";

interface EmergencyScheduleRangeSelectorProps {
  /** "/schedule" or "/manager" -- the two routes that render the Emergency Mode personal agenda. */
  basePath: string;
  /** The manager-selected colleague, when viewing someone else's agenda -- preserved as `?person=` across every range link. `null` for the viewer's own agenda (self/no manager). */
  personId: string | null;
  currentRange: EmergencyScheduleRangeKey;
}

const RANGE_OPTIONS: { key: EmergencyScheduleRangeKey; label: string }[] = [
  { key: "today", label: "היום" },
  { key: "tomorrow", label: "מחר" },
  { key: "7d", label: "7 ימים" },
  { key: "30d", label: "30 יום" },
];

/**
 * Same pill-tab classes as `ManagerRangeSelector`'s own `TAB_BASE`/active-
 * state treatment (light-mode contrast fix: the active tab carries a real
 * `ring-1 ring-border`, not just a same-family background shade) --
 * duplicated rather than imported, since coupling this Emergency-Mode-only
 * control to a Manager-feature file for one Tailwind string would be a
 * stranger dependency than the small duplication it avoids. Keep both
 * strings in sync by eye if either one's visual treatment changes.
 */
const TAB_BASE =
  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Omits `range` entirely for the default ("7 ימים"), matching `ManagerRangeSelector`'s own "the default range never appears in the URL" convention -- a bare `/schedule` link is exactly equivalent to `/schedule?range=7d`. */
function rangeHref(basePath: string, personId: string | null, range: EmergencyScheduleRangeKey): string {
  const params = new URLSearchParams();
  if (personId) params.set("person", personId);
  if (range !== DEFAULT_EMERGENCY_SCHEDULE_RANGE) params.set("range", range);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * "היום | מחר | 7 ימים | 30 יום" -- the Emergency Mode personal agenda's
 * own date-range selector (spec: "the selector should visually match the
 * equivalent controls already used elsewhere in the product"), visually
 * matching `ManagerRangeSelector`'s pill-tab treatment exactly. Server-
 * rendered plain `Link`s only, no client JS -- switching range is a normal
 * navigation, same convention as `MonthNav`/`ManagerRangeSelector`.
 *
 * Deliberately its OWN component (not `ManagerRangeSelector` reused
 * outright): that component's option set/URL shape
 * (`ManagerHrefParams`/`ManagerRangeKey`, today/7d/30d/month, tied to
 * `/manager`'s own `category`/`month` params) doesn't fit Emergency's
 * four options (today/tomorrow/7d/30d, no month mode, shared between
 * `/schedule` and `/manager`) -- reusing its VISUAL LANGUAGE, not its
 * component or its underlying `ManagerRangeKey` type, is the right level
 * of reuse here.
 */
export function EmergencyScheduleRangeSelector({ basePath, personId, currentRange }: EmergencyScheduleRangeSelectorProps) {
  return (
    <nav aria-label="טווח תאריכים" className="inline-flex items-center gap-1 rounded-full bg-overlay-soft p-1">
      {RANGE_OPTIONS.map((option) => {
        const isActive = currentRange === option.key;
        return (
          <Link
            key={option.key}
            href={rangeHref(basePath, personId, option.key)}
            aria-current={isActive ? "page" : undefined}
            className={`${TAB_BASE} ${isActive ? "bg-surface-1 text-primary ring-1 ring-border" : "text-muted hover:text-foreground"}`}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
