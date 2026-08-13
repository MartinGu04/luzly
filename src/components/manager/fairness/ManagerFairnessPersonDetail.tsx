import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Panel } from "@/components/ui/Panel";

export interface ManagerFairnessPersonDetailView {
  sourceName: string;
  allocationLabel: string;
  previousLabel: string;
  currentLabel: string;
  deltaLabel: string;
  targetLabel: string | null;
  gapLabel: string | null;
  normalizedLoadLabel: string | null;
  weekendLabel: string;
  exemptionBadges: string[];
  backHref: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-overlay-faint p-3">
      <p className="text-xs text-muted-2">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

/**
 * Focused single-person fairness drill-down (PR #15 §32/§33) -- manager-
 * relevant fields only, no email, no raw source coordinates. Never
 * fabricates an itemized score formula the sheet itself doesn't contain,
 * and never turns a low score + exemption into an assignment
 * recommendation (PR #15 §19/§20).
 */
export function ManagerFairnessPersonDetail({ view }: { view: ManagerFairnessPersonDetailView }) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={view.backHref}
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted transition-colors duration-200 hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
        חזרה לטבלת צדק
      </Link>

      <Panel variant="hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">{view.sourceName}</h2>
            <p className="mt-1 text-sm text-muted">{view.allocationLabel || "—"}</p>
          </div>
          {view.exemptionBadges.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {view.exemptionBadges.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-muted"
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="ניקוד קודם" value={view.previousLabel} />
          <Stat label="ניקוד נוכחי" value={view.currentLabel} />
          <Stat label="שינוי" value={view.deltaLabel} />
          <Stat label="יעד השוואה" value={view.targetLabel ?? "—"} />
          <Stat label="פער מהיעד" value={view.gapLabel ?? "—"} />
          <Stat label='סופ"שים' value={view.weekendLabel} />
        </div>

        {view.normalizedLoadLabel ? (
          <p className="mt-4 text-sm text-muted">
            <span className="text-muted-2">עומס יחסי (ביחס ליעד):</span> {view.normalizedLoadLabel}
          </p>
        ) : null}

        {view.exemptionBadges.length > 0 ? (
          <p className="mt-4 rounded-xl bg-overlay-soft px-3 py-2.5 text-xs text-muted">
            הפטורים משפיעים על ההתאמה לשיבוצים עתידיים מסוגים מסוימים -- הם אינם מוחקים ניקוד, סופי שבוע, או
            היסטוריית תורנויות שכבר בוצעו. ניקוד נמוך יחסית לצד פטור אינו בהכרח חוסר הוגנות.
          </p>
        ) : null}

        <p className="mt-4 text-xs text-muted-2">
          הניקוד הנוכחי מגיע ישירות מ-Google Sheet ומהווה את מקור האמת; Luzly אינה מפרקת אותו לרכיבים ואינה מחשבת
          ניקוד חלופי.
        </p>
      </Panel>
    </div>
  );
}
