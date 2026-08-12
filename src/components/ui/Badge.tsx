import type { ReactNode } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "critical" | "primary";

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-white/[0.06] text-muted ring-1 ring-white/10",
  success: "bg-success/10 text-success ring-1 ring-success/25",
  warning: "bg-warning/10 text-warning ring-1 ring-warning/25",
  critical: "bg-critical/10 text-critical ring-1 ring-critical/25",
  primary: "bg-primary/10 text-primary ring-1 ring-primary/25",
};

/** Small status pill for certainty/severity/coverage/role labels -- never the sole indicator of severity (always paired with text). */
export function Badge({ tone = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
