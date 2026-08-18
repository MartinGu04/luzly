import type { CalendarMonthKey } from "@/lib/domain/calendarMonth";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import { ManagerPersonSelector, type ManagerPersonOption } from "./ManagerPersonSelector";
import { ManagerRangeSelector } from "./ManagerRangeSelector";

interface ManagerCommandBarProps {
  people: ManagerPersonOption[];
  selectedPersonId: string | null;
  current: ManagerHrefParams;
  currentMonth: CalendarMonthKey | null;
  fetchedAt: string;
  /**
   * Whether the person-scope + date-range controls are shown at all --
   * `true` everywhere except the "התחברויות והתראות" category (see
   * `page.tsx`). That category is a current adoption/readiness snapshot,
   * not filtered by an operational date range or scoped to one person, so
   * showing "כולם"/"היום"/"7 ימים"/"30 יום"/"החודש" there would offer
   * controls that do nothing. `DataFreshnessStatus` (the Google Sheets
   * source/update status + refresh control) is NEVER gated by this --
   * data freshness is meaningful for every category, including this one.
   */
  showFilters?: boolean;
}

/**
 * "/manager"'s ONE global-controls bar (redesign) -- person scope, date
 * range, and data-freshness, together, so they read as clearly-owned
 * global state rather than scattered across the page. Deliberately
 * narrower than before: the old "הצג רק בעיות" action is gone (Overview,
 * `ManagerCategoryNav`'s default category, already IS that focused view --
 * a second control that also hid/showed sections would only fight the
 * category switch for the same job). Every control here is a real URL/
 * server-state control (`ManagerPersonSelector` changes `?person=`,
 * `ManagerRangeSelector` is a plain `Link` set) -- this component only
 * composes layout, it never adds client-side filtering of its own.
 *
 * Final polish pass: no more `Panel` card of its own -- the bordered/
 * shaded surface read as one more heavy panel among several stacked on the
 * page. A plain flow group (same "no chrome, just spacing" idiom the
 * dashboard's `Header`/`DataFreshnessStatus` pairing already uses) keeps
 * the controls grouped and readable without the extra visual weight.
 */
export function ManagerCommandBar({
  people,
  selectedPersonId,
  current,
  currentMonth,
  fetchedAt,
  showFilters = true,
}: ManagerCommandBarProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <DataFreshnessStatus fetchedAt={fetchedAt} />
      {showFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          <ManagerPersonSelector people={people} selectedId={selectedPersonId} />
          <ManagerRangeSelector current={current} currentMonth={currentMonth} />
        </div>
      ) : null}
    </div>
  );
}
