interface ManagerFairnessTargetsNoteProps {
  supervisorTarget: number | null;
  technicianTarget: number | null;
}

function trimmedNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * The period's parsed X/2X target context (PR #15 §12/§25) -- ALWAYS the
 * actual values parsed from the sheet's own note, never a hard-coded
 * 3/6 or 4/8. Honest "not identified" fallback when the note is
 * missing/malformed, never a silent default.
 */
export function ManagerFairnessTargetsNote({ supervisorTarget, technicianTarget }: ManagerFairnessTargetsNoteProps) {
  return (
    <p className="text-xs text-muted">
      <span className="text-muted-2">יעדי הקצאה לתקופה:</span>{" "}
      אחמ&quot;ש: X = {supervisorTarget !== null ? trimmedNumber(supervisorTarget) : "לא זוהה"} · טכנאי: 2X ={" "}
      {technicianTarget !== null ? trimmedNumber(technicianTarget) : "לא זוהה"}
    </p>
  );
}
