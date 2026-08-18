import type { ReactNode } from "react";

type PanelVariant = "hero" | "panel" | "compact" | "inline" | "critical";

interface PanelProps {
  variant?: PanelVariant;
  className?: string;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<PanelVariant, string> = {
  hero: "rounded-xl bg-surface-2 ring-1 ring-border-strong p-6 sm:p-7",
  panel: "rounded-xl bg-surface-1 ring-1 ring-border p-5",
  compact: "rounded-lg bg-surface-1 ring-1 ring-border p-4",
  inline: "rounded-lg bg-overlay-faint ring-1 ring-border p-3",
  critical: "rounded-xl bg-surface-critical ring-1 ring-surface-critical-border p-5",
};

/**
 * The app's surface vocabulary -- deliberately not one repeated rounded
 * rectangle. `hero` for the primary now/next state, `panel` for standalone
 * sections, `compact` for denser secondary content, `inline` for small
 * embedded status rows (a single counterpart, a timeline item), `critical`
 * for a section that itself IS the critical finding (not just an icon/badge
 * inside an otherwise-neutral panel).
 */
export function Panel({ variant = "panel", className = "", children }: PanelProps) {
  return <div className={`${VARIANT_CLASSES[variant]} ${className}`}>{children}</div>;
}
