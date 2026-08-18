interface DutiesHeaderProps {
  /**
   * "🚫 שמירות"-style badges (same `exemptionBadgeLabel` formatting Duty
   * Fairness cards already use) for any duty exemption the current period's
   * Fairness table records for this person -- omitted/empty renders nothing
   * extra, so a person with no exemption sees the exact same compact header
   * as before.
   */
  exemptionBadges?: readonly string[];
}

/** "תורנויות" page title -- compact, matching the restrained header language from PR #9/#10 (no giant KPI dashboard). */
export function DutiesHeader({ exemptionBadges = [] }: DutiesHeaderProps) {
  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">תורנויות</h1>
      <p className="mt-1.5 text-sm text-muted">כל מה שמחכה לך, במקום אחד.</p>
      {exemptionBadges.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="פטור מתורנויות">
          {exemptionBadges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center rounded-full bg-overlay-soft px-2 py-0.5 text-[11px] font-medium text-muted"
            >
              {badge}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
