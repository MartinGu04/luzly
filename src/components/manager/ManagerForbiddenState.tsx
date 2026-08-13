import { ShieldOff } from "lucide-react";
import { Panel } from "@/components/ui/Panel";

/**
 * Shown when an authenticated, mapped person hits `/manager` without
 * `isManager === true`. Deliberately not `AccessDeniedScreen` (that
 * screen's sign-out affordance is for someone who shouldn't be in Luzly
 * at all) -- this person IS a legitimate Luzly user, just not authorized
 * for this specific manager-only screen, so they stay signed in.
 */
export function ManagerForbiddenState() {
  return (
    <Panel variant="hero" className="text-center sm:text-start">
      <ShieldOff className="mx-auto h-6 w-6 text-muted sm:mx-0" aria-hidden="true" strokeWidth={1.75} />
      <h2 className="mt-3 text-xl font-bold text-foreground">המסך הזה מיועד למנהלים בלבד</h2>
      <p className="mt-1.5 text-sm text-muted">אין לך הרשאת ניהול ב-Luzly. פנה/י למנהל המערכת אם לדעתך זו טעות.</p>
    </Panel>
  );
}
