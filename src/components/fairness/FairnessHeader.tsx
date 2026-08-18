/**
 * Standalone "טבלת צדק" page title (PR #4) -- the ONE main-navigation
 * destination for both Fairness modes, never a manager-scoped sub-screen
 * (that was the old, now-removed `/manager/fairness`). The description
 * states the actual concept plainly -- actual workload compared with the
 * relevant expected target -- and deliberately avoids any language that
 * could read as evaluation, blame, or a queue for "who's next": Fairness
 * describes state, it does not assign the next shift/duty.
 */
export function FairnessHeader() {
  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">טבלת צדק</h1>
      <p className="mt-1.5 text-sm text-muted">
        השוואה בין העומס בפועל ליעד הרלוונטי לכל איש/אשת צוות -- תיאור מצב, לא ציון וגם לא המלצה למי לשבץ הבא.
      </p>
    </div>
  );
}
