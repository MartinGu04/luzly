import { UserRound } from "lucide-react";
import type { PersonalCounterpart } from "@/lib/readModels/types";
import { roleLabel } from "@/lib/presentation/labels";
import { Badge } from "@/components/ui/Badge";

interface TeammateRowProps {
  counterpart: PersonalCounterpart;
  shadow?: boolean;
}

/**
 * One teammate row: name, role, and only the badges that are structurally
 * true (shadow/handover, tentative). Deliberately never shows
 * `startTimeOverride`/`endTimeOverride` -- this screen has no full
 * `ShiftSchedule` to safely resolve them into real hours, and a guessed
 * "partial shift" from a single override would be worse than showing
 * nothing. `personId` is used only as a render key, never displayed.
 */
export function TeammateRow({ counterpart, shadow = false }: TeammateRowProps) {
  const role = roleLabel(counterpart.role);

  return (
    <li className="flex items-center gap-3 rounded-xl bg-overlay-faint px-3 py-2.5 ring-1 ring-border">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-overlay-soft text-muted">
        <UserRound className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{counterpart.personName}</p>
        {role ? <p className="truncate text-xs text-muted">{role}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {shadow ? <Badge tone="primary">חפיפה / צל</Badge> : null}
        {counterpart.certainty === "tentative" ? <Badge tone="warning">משוער</Badge> : null}
      </div>
    </li>
  );
}
