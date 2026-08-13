import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import { DutiesHeader } from "@/components/duties/DutiesHeader";
import { DutyBlockList } from "@/components/duties/DutyBlockList";
import { DutyFocusSection } from "@/components/duties/DutyFocusSection";
import { DutyViewToggle } from "@/components/duties/DutyViewToggle";
import type { DutyBlockView } from "@/components/duties/types";
import type { LocalNow } from "@/lib/domain/localNow";
import {
  actionsForBlock,
  dutyBlockEmoji,
  dutyBlockProgress,
  dutyBlockTitle,
  dutyCertaintyLabel,
  historyBlocks,
  isWeekendKitchenPartial,
  parseDutyView,
  remainingUpcomingBlocks,
  selectDutyFocus,
  summarizePendingActions,
} from "@/lib/presentation/duty";
import { formatDateRange } from "@/lib/presentation/hebrewDate";
import { formatHebrewCalendarDate, getHolidayContext } from "@/lib/presentation/hebrewCalendar";
import { getRequestPersonalSchedule } from "@/lib/readModels/getRequestPersonalSchedule";
import type { PersonalDutyAction, PersonalDutyBlock } from "@/lib/readModels/types";

function buildDutyBlockView(
  block: PersonalDutyBlock,
  actions: readonly PersonalDutyAction[],
  localNow: LocalNow,
): DutyBlockView {
  const isActive = block.dates.includes(localNow.date);
  const matched = actionsForBlock(block, actions);

  return {
    key: `${block.dutyFamily}-${block.slot ?? "x"}-${block.startDate}`,
    emoji: dutyBlockEmoji(block),
    title: dutyBlockTitle(block),
    dateRangeLabel: formatDateRange(block.startDate, block.endDate),
    dayCountLabel: block.dayCount > 1 ? `${block.dayCount} ימים` : null,
    certaintyLabel: dutyCertaintyLabel(block.certainty),
    weekendPartialWarning: isWeekendKitchenPartial(block),
    isActive,
    progress: isActive ? dutyBlockProgress(block, localNow.date) : null,
    pending: summarizePendingActions(matched, localNow),
  };
}

interface DutiesPageProps {
  searchParams: Promise<{ view?: string | string[] }>;
}

/**
 * The authenticated person's own duty overview -- NOT a shift calendar,
 * NOT a unit-wide roster, NOT fairness/scoring. By the time this renders,
 * the protected `(app)` layout has already gated everything but
 * "ok"/"configuration_error", same convention as the dashboard and
 * `/schedule`. Calling `getRequestPersonalSchedule()` again reuses the
 * SAME request-scoped result the layout already computed -- no second
 * Google request, no new read-model field: `dutyBlocks`/`dutyActions`
 * already carry everything this screen needs.
 */
export default async function DutiesPage({ searchParams }: DutiesPageProps) {
  const result = await getRequestPersonalSchedule();
  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const { model } = result;
  const todayDate = model.localNow.date;

  const params = await searchParams;
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = parseDutyView(rawView);

  const focus = selectDutyFocus(model.dutyBlocks, todayDate);
  const upcomingList = remainingUpcomingBlocks(model.dutyBlocks, focus.blocks, todayDate);
  const historyList = historyBlocks(model.dutyBlocks, todayDate);
  const listBlocks = view === "history" ? historyList : upcomingList;

  const focusDate = focus.status === "active" ? todayDate : (focus.blocks[0]?.startDate ?? null);

  /**
   * When there's no focus duty AND nothing else upcoming, the hero empty
   * state ("אין לך תורנויות קרובות 🎉") already says everything -- a second
   * "אין תורנויות נוספות באופק הקרוב." panel right below it would just
   * repeat the same fact. This never applies to the history view (which
   * always renders its own list/empty state), and never applies when a
   * focus duty exists but nothing else is upcoming -- there, the second
   * panel adds real information ("nothing beyond what's already shown
   * above").
   */
  const suppressRedundantUpcomingEmptyState =
    view === "upcoming" && focus.status === "none" && upcomingList.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <DutiesHeader />

      <DutyFocusSection
        status={focus.status}
        blocks={focus.blocks.map((block) => buildDutyBlockView(block, model.dutyActions, model.localNow))}
        hebrewDateLabel={focusDate ? formatHebrewCalendarDate(focusDate) : null}
        holiday={focusDate ? getHolidayContext(focusDate) : null}
      />

      <div className="flex items-center justify-between gap-4">
        <DutyViewToggle view={view} />
      </div>

      {suppressRedundantUpcomingEmptyState ? null : (
        <DutyBlockList
          blocks={listBlocks.map((block) => buildDutyBlockView(block, model.dutyActions, model.localNow))}
          title={view === "history" ? "היסטוריה אחרונה" : undefined}
          emptyMessage={
            view === "history" ? "אין עדיין היסטוריית תורנויות." : "אין תורנויות נוספות באופק הקרוב."
          }
        />
      )}
    </div>
  );
}
