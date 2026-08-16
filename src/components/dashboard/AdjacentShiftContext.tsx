import type { PersonalAdjacentShiftContext } from "@/lib/readModels/types";

interface AdjacentShiftContextRowProps {
  context: PersonalAdjacentShiftContext | null;
}

/**
 * מי לפניי / מי אחריי -- a small, secondary sense that shifts are moving
 * through the day, sitting quietly below "מי איתי" (never inside it, never
 * competing with it). Deliberately text-only, no avatars/cards -- this is
 * ambient context, not another roster panel. Each half renders only when
 * the read model actually resolved staffing for that adjacent shift;
 * `context`, `context.previous`, and `context.next` are independently
 * nullable and each renders nothing on its own rather than an empty state
 * ("מי לפניי — אין מידע" is never shown).
 */
export function AdjacentShiftContextRow({ context }: AdjacentShiftContextRowProps) {
  if (!context) return null;

  const previousNames = context.previous?.people.map((person) => person.personName).join(" · ") ?? null;
  const nextNames = context.next?.people.map((person) => person.personName).join(" · ") ?? null;

  if (!previousNames && !nextNames) return null;

  return (
    <div className="mt-4 space-y-1.5 text-xs text-muted-2">
      {previousNames ? (
        <p className="flex items-center gap-1.5">
          <span aria-hidden="true">←</span>
          <span className="shrink-0 font-medium text-muted">מי לפניי</span>
          <span className="truncate">{previousNames}</span>
        </p>
      ) : null}
      {nextNames ? (
        <p className="flex items-center gap-1.5">
          <span className="shrink-0 font-medium text-muted">מי אחריי</span>
          <span className="truncate">{nextNames}</span>
          <span aria-hidden="true">→</span>
        </p>
      ) : null}
    </div>
  );
}
