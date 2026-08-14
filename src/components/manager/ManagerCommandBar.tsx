import type { CalendarMonthKey } from "@/lib/domain/calendarMonth";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";
import { Panel } from "@/components/ui/Panel";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import { ManagerPersonSelector, type ManagerPersonOption } from "./ManagerPersonSelector";
import { ManagerProblemsToggle } from "./ManagerProblemsToggle";
import { ManagerRangeSelector } from "./ManagerRangeSelector";

interface ManagerCommandBarProps {
  people: ManagerPersonOption[];
  selectedPersonId: string | null;
  current: ManagerHrefParams;
  currentMonth: CalendarMonthKey | null;
  fetchedAt: string;
  /**
   * False on the selected-person view -- "הצג רק בעיות" filters the
   * EVERYONE overview and has no meaning once already drilled into one
   * person (Design Pass PR #21 §8), so it's omitted there entirely rather
   * than rendered disabled/non-functional.
   */
  showProblemsToggle: boolean;
}

/**
 * "/manager"'s unified command bar (Design Pass PR #21 §5/§6): person
 * scope + date range + freshness metadata + the problems-only action, all
 * in one intentional bar instead of scattered controls. RIGHT/primary
 * (renders first, which is visually the start side in RTL): person +
 * range. LEFT/high-attention (renders last, visually the end side):
 * "הצג רק בעיות" -- the command bar's most visually dominant action. Every
 * control here is a real URL/server-state control (`ManagerPersonSelector`
 * changes `?person=`, `ManagerRangeSelector`/`ManagerProblemsToggle` are
 * plain `Link`s) -- this component only composes layout, it never adds
 * client-side filtering of its own.
 */
export function ManagerCommandBar({
  people,
  selectedPersonId,
  current,
  currentMonth,
  fetchedAt,
  showProblemsToggle,
}: ManagerCommandBarProps) {
  return (
    <Panel variant="compact" className="flex flex-col gap-3">
      <DataFreshnessStatus fetchedAt={fetchedAt} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ManagerPersonSelector people={people} selectedId={selectedPersonId} />
          <ManagerRangeSelector current={current} currentMonth={currentMonth} />
        </div>
        {showProblemsToggle ? <ManagerProblemsToggle current={current} /> : null}
      </div>
    </Panel>
  );
}
