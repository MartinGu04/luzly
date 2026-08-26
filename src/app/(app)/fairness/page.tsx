import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/auth/AccessDeniedScreen";
import { DutyFairnessCard } from "@/components/fairness/DutyFairnessCard";
import { DutyFairnessDetail } from "@/components/fairness/DutyFairnessDetail";
import { FairnessDetailOverlay } from "@/components/fairness/FairnessDetailOverlay";
import { FairnessDutyPeriodNav } from "@/components/fairness/FairnessDutyPeriodNav";
import { FairnessGroupSection } from "@/components/fairness/FairnessGroupSection";
import { FairnessHeader } from "@/components/fairness/FairnessHeader";
import { FairnessModeToggle } from "@/components/fairness/FairnessModeToggle";
import { ShiftFairnessRoleSection } from "@/components/fairness/ShiftFairnessRoleSection";
import { ShiftFairnessDetail } from "@/components/fairness/ShiftFairnessDetail";
import { MonthNav } from "@/components/schedule/MonthNav";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import { Panel } from "@/components/ui/Panel";
import {
  calendarMonthOfLocalNow,
  parseMonthParam,
  shiftCalendarMonth,
} from "@/lib/domain/calendarMonth";
import type { DutyFairnessGroupView, DutyFairnessReadModel } from "@/lib/readModels/dutyFairnessTypes";
import type { ShiftFairnessGroupView, ShiftFairnessReadModel } from "@/lib/readModels/shiftFairnessTypes";
import { formatFairnessScore } from "@/lib/presentation/fairness";
import { buildDutyFairnessCardView, buildShiftFairnessCardView } from "@/lib/presentation/fairnessCards";
import { fairnessDutiesHref, fairnessShiftsHref, parseFairnessMode } from "@/lib/presentation/fairnessUrl";
import { formatHebrewMonthYear } from "@/lib/presentation/hebrewDate";
import { shiftFairnessPeriodLabel } from "@/lib/presentation/shiftFairnessPeriodLabel";
import { groupShiftFairnessCardsByServiceType } from "@/lib/presentation/shiftFairnessServiceGroups";
import { isShiftFairnessRowVisible } from "@/lib/presentation/shiftFairnessVisibility";
import { getRequestDutyFairness } from "@/lib/readModels/getRequestDutyFairness";
import { getRequestShiftFairness } from "@/lib/readModels/getRequestShiftFairness";
import { getRequestEmergencyFairness } from "@/lib/readModels/getRequestEmergencyFairness";
import { EmergencyFairnessSection } from "@/components/fairness/EmergencyFairnessSection";
import type { EmergencyFairnessReadModel } from "@/lib/readModels/emergencyFairnessTypes";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";

type SearchParamValue = string | string[] | undefined;

interface FairnessPageProps {
  searchParams: Promise<{
    mode?: SearchParamValue;
    month?: SearchParamValue;
    period?: SearchParamValue;
    person?: SearchParamValue;
  }>;
}

function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const SHIFT_GROUP_LABEL: Record<ShiftFairnessGroupView["role"], string> = {
  supervisor: "אחמ״שים",
  technician: "טכנאים",
};

const DUTY_GROUP_LABEL: Record<DutyFairnessGroupView["key"], string> = {
  supervisor: "אחמ״שים",
  technician: "טכנאים",
  other: "אחרים",
};

/**
 * Both loaders share the exact same non-"ok" status vocabulary (the
 * fail-closed identity states from `loadFairnessWorkbookContext`) -- one
 * shared render for all of them, same convention the protected layout
 * itself uses. `configuration_error` is NOT one of these -- neither
 * Fairness mode depends on the shift-schedule configuration a
 * `configuration_error` reports on, so `loadFairnessWorkbookContext`
 * never surfaces it; only real identity-resolution failures reach here.
 */
type FairnessAuthFailureStatus = "unauthenticated" | "missing_email" | "unmapped" | "ambiguous_identity";

function renderAuthFailure(status: FairnessAuthFailureStatus): ReactNode {
  if (status === "unauthenticated") redirect("/login");
  return <AccessDeniedScreen />;
}

/**
 * "טבלת צדק" -- the standalone Fairness experience (PR #4), a real main-
 * navigation destination available to every mapped user, not a manager-only
 * screen. Exactly two modes, `?mode=shifts` (default) / `?mode=duties`,
 * each independently loading ONLY its own read model (`getRequestShiftFairness`/
 * `getRequestDutyFairness`) -- never both on the same render, and never a
 * third combined mode. Both loaders go through `loadFairnessWorkbookContext()`
 * (PR #4, non-manager-only) and request the SAME fixed source set, so
 * switching mode or navigating periods within the short cache TTL reuses
 * the same snapshot instead of a fresh Google read.
 *
 * A single async function -- the actual async work (the one loader call
 * for the resolved mode) happens directly here, with the rest of the
 * rendering delegated to plain, synchronous helpers below. Deliberately
 * NOT split into further async sub-components: this keeps exactly one
 * `await` boundary for the whole page, easy to reason about, and testable
 * by simply awaiting this one function.
 */
export default async function FairnessPage({ searchParams }: FairnessPageProps) {
  const params = await searchParams;
  const mode = parseFairnessMode(firstParam(params.mode));
  const rawPersonId = firstParam(params.person) ?? null;

  if (mode === "duties") {
    const result = await getRequestDutyFairness(firstParam(params.period) ?? null);
    if (result.status !== "ok") return renderAuthFailure(result.status);
    return renderDutyFairnessView(result.model, rawPersonId);
  }

  if (mode === "emergency") {
    const result = await getRequestEmergencyFairness();
    if (result.status === "unavailable") return renderEmergencyFairnessUnavailable();
    if (result.status !== "ok") return renderAuthFailure(result.status);
    return renderEmergencyFairnessView(result.model);
  }

  const result = await getRequestShiftFairness(firstParam(params.month) ?? null);
  if (result.status !== "ok") return renderAuthFailure(result.status);
  return renderShiftFairnessView(result.model, rawPersonId);
}

function renderShiftFairnessView(model: ShiftFairnessReadModel, rawPersonId: string | null): ReactNode {
  const now = getJerusalemLocalNow();
  // `model.month` is already the loader's own resolved (never invalid) month -- an absent/invalid `?month=` already fell back to the current Jerusalem-local month inside `loadShiftFairnessReadModel`, so this always parses.
  const displayMonthKey = parseMonthParam(model.month) ?? calendarMonthOfLocalNow(now);
  const currentMonthKey = calendarMonthOfLocalNow(now);
  const isOnCurrentMonth = displayMonthKey.year === currentMonthKey.year && displayMonthKey.month === currentMonthKey.month;
  const monthLabel = formatHebrewMonthYear(displayMonthKey.year, displayMonthKey.month) ?? "";
  const periodLabel = shiftFairnessPeriodLabel(monthLabel, isOnCurrentMonth);

  const prevHref = fairnessShiftsHref({ monthKey: shiftCalendarMonth(displayMonthKey, -1) });
  const nextHref = fairnessShiftsHref({ monthKey: shiftCalendarMonth(displayMonthKey, 1) });
  const todayHref = fairnessShiftsHref();

  // The detail overlay deep-link (`?person=`) resolves against the FULL,
  // unfiltered roster -- a person hidden from the card list below (§5, a
  // genuine non-participant) can still be reached by an existing direct
  // link; only the summary list itself is filtered.
  const allRows = model.groups.flatMap((group) => group.rows);
  const selectedRow = rawPersonId ? (allRows.find((row) => row.personId === rawPersonId) ?? null) : null;
  const selectedGroupRole = model.groups.find((group) => group.rows.some((row) => row.personId === rawPersonId))?.role;

  const groupsView = model.groups.map((group) => {
    // PRESENTATION-only filtering (§5) -- a row with zero actual work and
    // zero KNOWN target (and no meaningful weekend actual/target) is
    // omitted from the visible list; the Fairness calculation itself never
    // sees this filter (it already ran, above, over the full `group.rows`).
    const visibleRows = group.rows.filter(isShiftFairnessRowVisible);
    const cards = visibleRows.map((row) =>
      buildShiftFairnessCardView(row, fairnessShiftsHref({ monthKey: displayMonthKey, personId: row.personId }), isOnCurrentMonth),
    );
    return {
      role: group.role,
      label: SHIFT_GROUP_LABEL[group.role],
      cards,
      // Subgrouped from the already visibility-filtered cards -- an empty
      // service subgroup (or a whole empty role section, handled below) is
      // therefore based on what's actually rendered, never the raw counts.
      subgroups: groupShiftFairnessCardsByServiceType(cards),
    };
  });
  const hasAnyRows = groupsView.some((group) => group.cards.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <FairnessHeader />
        <FairnessModeToggle active="shifts" emergencyAvailable />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav prevHref={prevHref} nextHref={nextHref} todayHref={todayHref} isOnCurrentMonth={isOnCurrentMonth} monthLabel={monthLabel} />
        <DataFreshnessStatus fetchedAt={model.fetchedAt} />
      </div>

      <p className="text-xs text-muted-2">{periodLabel}</p>

      {!hasAnyRows ? (
        <Panel variant="compact" className="text-sm text-muted">
          אין נתוני משמרות זמינים לתקופה שנבחרה.
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          {groupsView.map((group) =>
            group.cards.length > 0 ? (
              <ShiftFairnessRoleSection key={group.role} label={group.label} count={group.cards.length} subgroups={group.subgroups} />
            ) : null,
          )}
        </div>
      )}

      {selectedRow ? (
        <FairnessDetailOverlay
          key={selectedRow.personId}
          closeHref={fairnessShiftsHref({ monthKey: displayMonthKey })}
          title={selectedRow.personName}
        >
          <ShiftFairnessDetail
            view={buildShiftFairnessCardView(
              selectedRow,
              fairnessShiftsHref({ monthKey: displayMonthKey, personId: selectedRow.personId }),
              isOnCurrentMonth,
            )}
            groupLabel={selectedGroupRole ? SHIFT_GROUP_LABEL[selectedGroupRole] : ""}
          />
        </FairnessDetailOverlay>
      ) : null}
    </div>
  );
}

function renderDutyFairnessView(model: DutyFairnessReadModel, rawPersonId: string | null): ReactNode {
  const allRows = model.groups.flatMap((group) => group.rows);
  const selectedRow = rawPersonId ? (allRows.find((row) => row.personId === rawPersonId) ?? null) : null;

  const groupsView = model.groups.map((group) => ({
    key: group.key,
    label: DUTY_GROUP_LABEL[group.key],
    cards: group.rows.map((row) =>
      buildDutyFairnessCardView(row, row.personId ? fairnessDutiesHref({ period: model.period.key, personId: row.personId }) : null),
    ),
  }));
  const hasAnyRows = groupsView.some((group) => group.cards.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <FairnessHeader />
        <FairnessModeToggle active="duties" emergencyAvailable />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FairnessDutyPeriodNav current={model.period.key} currentLabel={model.period.label} />
        <DataFreshnessStatus fetchedAt={model.fetchedAt} />
      </div>

      {!hasAnyRows ? (
        <Panel variant="compact" className="text-sm text-muted">
          לא נמצאה טבלת צדק לתקופה שנבחרה.
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          {groupsView.map((group) =>
            group.cards.length > 0 ? (
              <FairnessGroupSection key={group.key} label={group.label} count={group.cards.length}>
                {group.cards.map((card) => (
                  <DutyFairnessCard key={card.key} view={card} />
                ))}
              </FairnessGroupSection>
            ) : null,
          )}
        </div>
      )}

      {selectedRow ? (
        <FairnessDetailOverlay
          key={selectedRow.personId ?? selectedRow.key}
          closeHref={fairnessDutiesHref({ period: model.period.key })}
          title={selectedRow.sourceName}
        >
          <DutyFairnessDetail
            view={buildDutyFairnessCardView(selectedRow, null)}
            previousLabel={formatFairnessScore(selectedRow.previousScore)}
          />
        </FairnessDetailOverlay>
      ) : null}
    </div>
  );
}

/**
 * Emergency shift fairness (spec section 16/17) -- deliberately its own
 * simpler view, never sharing `ShiftFairnessRoleSection`/
 * `ShiftFairnessCard`/`DutyFairnessCard`, since it has no expected-shift,
 * weekend, or target concept at all -- only assignment counts grouped by
 * `גזירת נתונים` membership.
 */
function renderEmergencyFairnessView(model: EmergencyFairnessReadModel): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <FairnessHeader />
        <FairnessModeToggle active="emergency" emergencyAvailable />
      </div>

      <DataFreshnessStatus fetchedAt={model.fetchedAt} />

      <EmergencyFairnessSection model={model} />
    </div>
  );
}

/** The emergency workbook itself is not configured/readable -- a graceful, non-blocking state (never an auth-failure screen), since a deployment that has never touched Emergency Mode should still be able to view this tab without alarm. */
function renderEmergencyFairnessUnavailable(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <FairnessHeader />
        <FairnessModeToggle active="emergency" emergencyAvailable />
      </div>
      <Panel variant="compact" className="text-sm text-muted">
        אין עדיין נתוני חירום זמינים.
      </Panel>
    </div>
  );
}
