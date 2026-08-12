import type { ReactNode } from "react";

type PanelVariant = "hero" | "panel" | "compact" | "inline";

interface PanelProps {
  variant?: PanelVariant;
  className?: string;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<PanelVariant, string> = {
  hero: "rounded-3xl bg-surface-2 ring-1 ring-border-strong shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_24px_60px_-28px_rgba(0,0,0,0.65)] p-6 sm:p-7",
  panel: "rounded-2xl bg-surface-1 ring-1 ring-border p-5",
  compact: "rounded-xl bg-surface-1 ring-1 ring-border p-4",
  inline: "rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3",
};

/**
 * The dashboard's surface vocabulary -- deliberately not one repeated
 * rounded rectangle. `hero` for the primary now/next state, `panel` for
 * standalone sections, `compact` for denser secondary content, `inline`
 * for small embedded status rows (a single counterpart, a timeline item).
 */
export function Panel({ variant = "panel", className = "", children }: PanelProps) {
  return <div className={`${VARIANT_CLASSES[variant]} ${className}`}>{children}</div>;
}
