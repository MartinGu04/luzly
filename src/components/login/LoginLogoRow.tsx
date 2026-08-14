import type { ReactNode } from "react";

interface LoginLogoRowProps {
  /** Not wired up yet -- no logo assets exist. Once they do, pass them here (and `secondary`) to activate the slot. */
  primary?: ReactNode;
  secondary?: ReactNode;
}

/**
 * Reserved top-of-hero slot for two future organizational logos, laid out
 * as [logo] [divider] [logo]. Intentionally renders nothing today -- no
 * placeholder boxes, no "LOGO 1 / LOGO 2" text -- so the login page reads
 * as complete without it. Wiring real assets in later is a matter of
 * passing `primary`/`secondary` from the login page; no layout rework.
 */
export function LoginLogoRow({ primary, secondary }: LoginLogoRowProps) {
  if (!primary && !secondary) return null;

  return (
    <div className="flex items-center gap-3">
      {primary}
      {primary && secondary ? <span aria-hidden="true" className="h-6 w-px bg-white/20" /> : null}
      {secondary}
    </div>
  );
}
