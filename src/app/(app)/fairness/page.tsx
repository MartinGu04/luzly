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
import { classifyPersonnelType, type PersonnelServiceCategory } from "@/lib/domain/personnelType";
import type { Person } from "@/lib/domain/types";
import type { DutyFairnessGroupView, DutyFairnessReadModel } from "@/lib/readModels/dutyFairnessTypes";
import type { ShiftFairnessGroupView, ShiftFairnessReadModel } from "@/lib/readModels/shiftFairnessTypes";
import { formatFairnessScore } from "@/lib/presentation/fairness";
import { buildDutyFairnessCardView, buildShiftFairnessCardView } from "@/lib/presentation/fairnessCards";
import { fairnessDutiesHref, fairnessShiftsHref, parseFairnessMode } from "@/lib/presentation/fairnessUrl";
import { formatHebrewMonthYear } from "@/lib/presentation/hebrewDate";
import { groupShiftFairnessCardsByServiceType } from "@/lib/presentation/shiftFairnessServiceGroups";
import { getRequestDutyFairness } from "@/lib/readModels/getRequestDutyFairness";
import { getRequestShiftFairness } from "@/lib/readModels/getRequestShiftFairness";
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

  const result = await getRequestShiftFairness(firstParam(params.month) ?? null);
  if (result.status !== "ok") return renderAuthFailure(result.status);
  return renderShiftFairnessView(result.model, result.people, rawPersonId);
}

function renderShiftFairnessView(model: ShiftFairnessReadModel, people: readonly Person[], rawPersonId: string | null): ReactNode {
  const now = getJerusalemLocalNow();
  // `model.month` is already the loader's own resolved (never invalid) month -- an absent/invalid `?month=` already fell back to the current Jerusalem-local month inside `loadShiftFairnessReadModel`, so this always parses.
  const displayMonthKey = parseMonthParam(model.month) ?? calendarMonthOfLocalNow(now);
  const currentMonthKey = calendarMonthOfLocalNow(now);
  const isOnCurrentMonth = displayMonthKey.year === currentMonthKey.year && displayMonthKey.month === currentMonthKey.month;
  const monthLabel = formatHebrewMonthYear(displayMonthKey.year, displayMonthKey.month) ?? "";

  const prevHref = fairnessShiftsHref({ monthKey: shiftCalendarMonth(displayMonthKey, -1) });
  const nextHref = fairnessShiftsHref({ monthKey: shiftCalendarMonth(displayMonthKey, 1) });
  const todayHref = fairnessShiftsHref();

  const allRows = model.groups.flatMap((group) => group.rows);
  const selectedRow = rawPersonId ? (allRows.find((row) => row.personId === rawPersonId) ?? null) : null;
  const selectedGroupRole = model.groups.find((group) => group.rows.some((row) => row.personId === rawPersonId))?.role;

  // PRESENTATION-only subdivision within each role section, by service
  // type -- the Fairness comparison itself stays role-based (unchanged
  // above); this never feeds back into target/status/deviation.
  const serviceCategoryByPersonId = new Map<string, PersonnelServiceCategory>(
    people.map((candidate) => [candidate.id, classifyPersonnelType(candidate.personnelType)]),
  );

  const groupsView = model.groups.map((group) => {
    const cards = group.rows.map((row) =>
      buildShiftFairnessCardView(row, fairnessShiftsHref({ monthKey: displayMonthKey, personId: row.personId })),
    );
    return {
      role: group.role,
      label: SHIFT_GROUP_LABEL[group.role],
      cards,
      subgroups: groupShiftFairnessCardsByServiceType(cards, serviceCategoryByPersonId),
    };
  });
  const hasAnyRows = groupsView.some((group) => group.cards.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <FairnessHeader />
        <FairnessModeToggle active="shifts" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav prevHref={prevHref} nextHref={nextHref} todayHref={todayHref} isOnCurrentMonth={isOnCurrentMonth} monthLabel={monthLabel} />
        <DataFreshnessStatus fetchedAt={model.fetchedAt} />
      </div>

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
            view={buildShiftFairnessCardView(selectedRow, fairnessShiftsHref({ monthKey: displayMonthKey, personId: selectedRow.personId }))}
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
        <FairnessModeToggle active="duties" />
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
            normalizedLoad={selectedRow.normalizedLoad}
            previousLabel={formatFairnessScore(selectedRow.previousScore)}
          />
        </FairnessDetailOverlay>
      ) : null}
    </div>
  );
}
