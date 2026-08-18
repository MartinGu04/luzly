import { Panel } from "@/components/ui/Panel";
import type { ManagerAdoptionSectionView } from "@/lib/presentation/managerAdoption";

interface ManagerAdoptionSummaryProps {
  view: ManagerAdoptionSectionView;
}

/**
 * The "התחברויות והתראות" category's top summary -- a headline sentence
 * ("X מתוך Y כבר נכנסו למערכת") plus every count from the product spec
 * (`buildAdoptionStats` in `lib/presentation/managerAdoption.ts`), never a
 * decorative statistic. `unavailable` shows the same small neutral notice
 * the old מצב התראות aside used -- an infra failure must never look
 * identical to "everyone is ready".
 */
export function ManagerAdoptionSummary({ view }: ManagerAdoptionSummaryProps) {
  if (view.kind === "hidden") return null;

  if (view.kind === "unavailable") {
    return (
      <Panel variant="compact">
        <p className="text-sm text-muted">לא ניתן לבדוק כרגע את מצב ההתחברויות וההתראות</p>
      </Panel>
    );
  }

  return (
    <Panel variant="panel">
      <p className="text-[15px] font-semibold text-foreground">{view.headline}</p>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {view.stats.map((stat) => (
          <div key={stat.label} className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-2">{stat.label}</dt>
            <dd className="text-sm font-semibold text-foreground">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
