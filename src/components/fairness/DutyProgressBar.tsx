/**
 * Justice Table redesign -- Duty progress bar. Renders through 100% exactly
 * like a normal progress bar, then visually distinguishes the over-target
 * portion instead of clipping it away (spec: "show the normal progress bar
 * through 100%, then visually distinguish the over-target portion").
 *
 * Since a bar's own width can never literally exceed 100%, an over-target
 * ratio is represented by re-scaling what "100% of the bar" means: the
 * point where the real target sits moves LEFT of the bar's own end, and
 * the segment from there to the end (still real, still filled) is tinted
 * with the "above" status color instead of the normal one -- e.g. at 116%,
 * the first ~86% of the bar (0 -> target) is the normal tone, and the
 * remaining ~14% (target -> 116%) is the overflow tone. This never treats
 * exceeding a target as an achievement or an error -- it's simply shown as
 * the real fact it is.
 */
export function DutyProgressBar({ ratio }: { ratio: number }) {
  const clamped = Math.max(ratio, 0);
  const overflow = clamped > 1;
  const basePercent = overflow ? (1 / clamped) * 100 : clamped * 100;

  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-overlay-faint"
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full bg-status-balanced" style={{ width: `${basePercent}%` }} />
      {overflow ? <div className="h-full bg-status-above" style={{ width: `${100 - basePercent}%` }} /> : null}
    </div>
  );
}
