import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/auth/AccessDeniedScreen";
import { Panel } from "@/components/ui/Panel";
import { PlannedRangeCountdown } from "@/components/shootingRanges/PlannedRangeCountdown";
import { QualificationLiveCard } from "@/components/shootingRanges/QualificationLiveCard";
import { SelfReportForm } from "@/components/shootingRanges/SelfReportForm";
import { ShootingRangeHistoryList } from "@/components/shootingRanges/ShootingRangeHistoryList";
import { daysBetweenCalendarDates } from "@/lib/domain/dutyBlocks";
import { formatReportOneDateSlash } from "@/lib/presentation/reportOneFormat";
import { loadShootingRangeQualification } from "@/lib/readModels/shootingRangeQualification";
import { jerusalemEndOfDayInstant, jerusalemStartOfDayInstant, getJerusalemLocalNow } from "@/lib/time/jerusalemClock";

/**
 * "מטווחים" -- the real personal shooting-range qualification page,
 * replacing the previous "בקרוב" placeholder. Server-computes the
 * authoritative baseline/expiry/planned-range INSTANTS once per request
 * (`loadShootingRangeQualification` + the conversions below); the live
 * ticking display itself is entirely client-side (`QualificationLiveCard`/
 * `PlannedRangeCountdown`), never server polling.
 */
export default async function ShootingRangesPage() {
  const result = await loadShootingRangeQualification();

  if (result.status === "unauthenticated") redirect("/login");
  if (result.status === "not_applicable") return <NotApplicableView isManager={result.person.isManager} />;
  if (result.status !== "ok") return <AccessDeniedScreen />;

  const { model } = result;
  const today = getJerusalemLocalNow().date;

  const baselineDateLabel = model.baselineDate ? formatReportOneDateSlash(model.baselineDate) : null;
  const expiryDateLabel = model.expiryDate ? formatReportOneDateSlash(model.expiryDate) : null;
  const startInstantIso = model.baselineDate ? jerusalemStartOfDayInstant(model.baselineDate).toISOString() : null;
  const expiryInstantIso = model.expiryDate ? jerusalemEndOfDayInstant(model.expiryDate).toISOString() : null;
  const initialDaysRemaining = model.expiryDate ? daysBetweenCalendarDates(today, model.expiryDate) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">מטווחים</h1>
        {result.person.isManager ? (
          <Link href="/shooting-ranges/manager" className="text-sm text-primary hover:underline">
            תצוגת מנהל
          </Link>
        ) : null}
      </div>

      <Panel variant="hero">
        <QualificationLiveCard
          status={model.status}
          baselineDateLabel={baselineDateLabel}
          expiryDateLabel={expiryDateLabel}
          startInstantIso={startInstantIso}
          expiryInstantIso={expiryInstantIso}
          initialDaysRemaining={initialDaysRemaining}
        />
      </Panel>

      {model.plannedRange ? (
        <Panel variant="panel">
          <PlannedRangeCountdown
            status={model.plannedRange.status}
            rangeDateLabel={formatReportOneDateSlash(model.plannedRange.rangeDate) ?? model.plannedRange.rangeDate}
            rangeDateStartInstantIso={jerusalemStartOfDayInstant(model.plannedRange.rangeDate).toISOString()}
          />
        </Panel>
      ) : null}

      <Panel variant="panel" className="flex flex-col items-center gap-3">
        {model.pendingSelfReport ? (
          <p className="text-sm text-muted">
            🟡 דיווח מ-{formatReportOneDateSlash(model.pendingSelfReport.performedOn)} ממתין לאישור מנהל.
          </p>
        ) : (
          <SelfReportForm />
        )}
      </Panel>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">היסטוריית מטווחים</h2>
        <ShootingRangeHistoryList history={model.history} />
      </div>
    </div>
  );
}

/**
 * מטווחים is scoped to regular-service (חובה) personnel only -- shown for
 * an authenticated, mapped permanent (קבע) or reserve (מילואים) person
 * instead of a qualification card. Calm and truthful (same spirit as "no
 * qualification data" -- never an access-denied tone, since this isn't a
 * security boundary, just product scope). Still shows the manager-overview
 * link when relevant: a non-regular MANAGER overseeing regular personnel
 * must still reach the team overview even though the feature doesn't
 * apply to them personally.
 */
function NotApplicableView({ isManager }: { isManager: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">מטווחים</h1>
        {isManager ? (
          <Link href="/shooting-ranges/manager" className="text-sm text-primary hover:underline">
            תצוגת מנהל
          </Link>
        ) : null}
      </div>
      <Panel variant="panel" className="text-center text-sm text-muted">
        מטווחים זמין לחיילי שירות סדיר בלבד.
      </Panel>
    </div>
  );
}
