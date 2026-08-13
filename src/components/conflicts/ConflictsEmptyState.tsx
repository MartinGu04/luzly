import { Panel } from "@/components/ui/Panel";

/**
 * Shown only when `model.issues` is empty -- never alongside any severity
 * section. Deliberately scoped to the authenticated person's own
 * currently-relevant findings, never a claim about the whole unit schedule.
 */
export function ConflictsEmptyState() {
  return (
    <Panel variant="hero" className="text-center sm:text-start">
      <span aria-hidden="true" className="text-3xl">
        ✅
      </span>
      <p className="mt-3 text-base font-semibold text-foreground">הכול נראה תקין</p>
      <p className="mt-1.5 text-sm text-muted">לא נמצאו כרגע התנגשויות או דברים שדורשים בדיקה בסידור שלך.</p>
    </Panel>
  );
}
