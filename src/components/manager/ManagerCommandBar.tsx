import type { CalendarMonthKey } from "@/lib/domain/calendarMonth";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";
import { Panel } from "@/components/ui/Panel";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import { ManagerPersonSelector, type ManagerPersonOption } from "./ManagerPersonSelector";
import { ManagerRangeSelector } from "./ManagerRangeSelector";

interface ManagerCommandBarProps {
  people: ManagerPersonOption[];
  selectedPersonId: string | null;
  current: ManagerHrefParams;
  currentMonth: CalendarMonthKey | null;
  fetchedAt: string;
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
 */
export function ManagerCommandBar({ people, selectedPersonId, current, currentMonth, fetchedAt }: ManagerCommandBarProps) {
  return (
    <Panel variant="compact" className="flex flex-col gap-3">
      <DataFreshnessStatus fetchedAt={fetchedAt} />
      <div className="flex flex-wrap items-center gap-2">
        <ManagerPersonSelector people={people} selectedId={selectedPersonId} />
        <ManagerRangeSelector current={current} currentMonth={currentMonth} />
      </div>
    </Panel>
  );
}
