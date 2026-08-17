import { Header } from "@/components/dashboard/Header";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import type { PermanentManagerHomeReadModel } from "@/lib/readModels/permanentManagerHomeTypes";
import { ShiftSnapshotCard } from "./ShiftSnapshotCard";
import { TodayOperationalContext } from "./TodayOperationalContext";

interface PermanentManagerHomeProps {
  model: PermanentManagerHomeReadModel;
}

/**
 * "מה קורה עכשיו במחלקה?" -- the operational snapshot Home for an
 * authenticated permanent (קבע) manager (see `page.tsx` for the exact
 * eligibility gate). Entirely driven by `PermanentManagerHomeReadModel` --
 * no raw Event/Person, no Potential/Fairness, no recommendation evidence.
 * A coverage problem links out to the EXISTING `/manager` "דורש טיפול"
 * flow (see `ShiftSnapshotCard`) rather than reproducing it here.
 *
 * Layout: previous/current/next as a row on desktop (current visibly
 * dominant via `order`/grid weighting, never plain DOM order alone -- see
 * the `order-*` classes below), current-first stacked on mobile, followed
 * by the smaller "today" section.
 */
export function PermanentManagerHome({ model }: PermanentManagerHomeProps) {
  const todayDate = model.localNow.date;

  return (
    <div className="flex flex-col gap-6">
      <Header personName={model.person.name} localNow={model.localNow} />
      <DataFreshnessStatus fetchedAt={model.fetchedAt} />

      <div>
        <h2 className="mb-3 text-lg font-bold text-foreground sm:text-xl">מה קורה עכשיו במחלקה?</h2>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_1.5fr_1fr]">
          <div className="order-2 lg:order-1">
            <ShiftSnapshotCard label="הקודמת" shift={model.previousShift} todayDate={todayDate} />
          </div>
          <div className="order-1 lg:order-2">
            <ShiftSnapshotCard
              label="המשמרת עכשיו"
              shift={model.currentShift}
              todayDate={todayDate}
              current={{ timing: model.currentShift.timing, fetchedAt: model.fetchedAt }}
            />
          </div>
          <div className="order-3 lg:order-3">
            <ShiftSnapshotCard label="הבאה" shift={model.nextShift} todayDate={todayDate} />
          </div>
        </div>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
        <TodayOperationalContext duties={model.todayDuties} absences={model.todayAbsences} />
      </div>
    </div>
  );
}
