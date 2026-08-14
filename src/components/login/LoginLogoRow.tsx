import type { ReactNode } from "react";

interface LoginLogoRowProps {
  /** תקש"ל / תקשורת אסטרטגית logos (Design Pass PR #23) -- pass either/both to render the row. */
  primary?: ReactNode;
  secondary?: ReactNode;
}

/**
 * Top-of-hero slot for the two organizational logos, laid out as
 * [logo] [divider] [logo]. Renders nothing if neither is passed -- no
 * placeholder boxes, no "LOGO 1 / LOGO 2" text -- so the login page still
 * reads as complete without it.
 */
export function LoginLogoRow({ primary, secondary }: LoginLogoRowProps) {
  if (!primary && !secondary) return null;

  return (
    <div className="flex items-center gap-4 lg:gap-5">
      {primary}
      {primary && secondary ? <span aria-hidden="true" className="h-8 w-px bg-white/20 lg:h-12" /> : null}
      {secondary}
    </div>
  );
}
