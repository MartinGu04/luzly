import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/auth/AccessDeniedScreen";
import { ManagerForbiddenState } from "@/components/manager/ManagerForbiddenState";
import { ShootingRangeManagerPanel } from "@/components/shootingRanges/ShootingRangeManagerPanel";
import { loadShootingRangeManagerOverview } from "@/lib/readModels/shootingRangeManagerOverview";

/**
 * "מטווחים" -- the manager-only team qualification overview, living inside
 * this feature's own route tree (spec: "a team overview within the
 * feature") rather than as a new category bolted onto the existing, large
 * `/manager` overview system -- keeps that area's own regression surface
 * completely untouched. Manager-only via `loadShootingRangeManagerOverview`
 * (which reuses the SAME `loadManagerWorkbookContext` authorization
 * boundary every other manager screen uses).
 */
export default async function ShootingRangeManagerPage() {
  const result = await loadShootingRangeManagerOverview();

  if (result.status === "unauthenticated") redirect("/login");
  if (result.status === "forbidden") return <ManagerForbiddenState />;
  if (result.status !== "ok") return <AccessDeniedScreen />;

  const { model } = result;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">מטווחים -- תצוגת מנהל</h1>
      <ShootingRangeManagerPanel
        summary={model.summary}
        rows={model.rows}
        pendingSelfReports={model.pendingSelfReports}
        roster={model.rows.map((row) => ({ id: row.personId, name: row.personName }))}
      />
    </div>
  );
}
