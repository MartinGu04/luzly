import Link from "next/link";
import { fairnessDutiesHref, fairnessShiftsHref, type FairnessMode } from "@/lib/presentation/fairnessUrl";

interface FairnessModeToggleProps {
  active: FairnessMode;
}

const TAB_BASE =
  "flex-1 min-w-0 rounded-full px-4 py-2 text-center text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-initial sm:px-5";

/**
 * `[ משמרות ] [ תורנויות ]` -- the ONE mode switch for the standalone
 * Fairness experience (PR #4). Real, server-rendered `Link`s (same
 * convention as `ManagerSubNav`/`ManagerFairnessPeriodSelector`), never
 * client-only tab state, so each mode stays directly linkable/shareable/
 * back-button-safe. Switching mode always lands on that mode's OWN default
 * entry point (`fairnessShiftsHref()`/`fairnessDutiesHref()` with no
 * `month`/`period`/`person`) -- an H1/H2-only `?period=` must never leak
 * into the Shift experience, and vice versa; a selected person has no
 * meaning across modes either, so it's dropped too (same reasoning
 * `ManagerFairnessPeriodSelector` already applies to a period switch).
 *
 * `role="tablist"`/`aria-selected` gives the selected state an accessible
 * name beyond color alone; `flex-1` on mobile keeps both pills equal width
 * and full-bleed (compact, no dead space), `sm:flex-initial` lets them
 * settle to their natural width on larger screens instead of stretching.
 */
export function FairnessModeToggle({ active }: FairnessModeToggleProps) {
  return (
    <div role="tablist" aria-label="מצב תצוגה" className="flex items-stretch gap-1 rounded-full bg-overlay-soft p-1">
      <Link
        href={fairnessShiftsHref()}
        role="tab"
        aria-selected={active === "shifts"}
        className={`${TAB_BASE} ${active === "shifts" ? "bg-surface-1 text-primary" : "text-muted hover:text-foreground"}`}
      >
        משמרות
      </Link>
      <Link
        href={fairnessDutiesHref()}
        role="tab"
        aria-selected={active === "duties"}
        className={`${TAB_BASE} ${active === "duties" ? "bg-surface-1 text-primary" : "text-muted hover:text-foreground"}`}
      >
        תורנויות
      </Link>
    </div>
  );
}
