import { Lock } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { APP_VERSION } from "@/lib/config/appVersion";
import { APP_NAME } from "@/lib/config/productName";
import { LOGIN_AUTH_NOTE, LOGIN_WELCOME_HEADING, LOGIN_WELCOME_SUBTEXT } from "@/lib/config/loginCopy";
import { LoginErrorNotice } from "./LoginErrorNotice";

interface LoginAuthPanelProps {
  hasAuthError: boolean;
}

/**
 * The login route's authentication side (Design Pass PR #22, hardened for
 * "auth glass presence" so it reads as a branded Luzly surface rather than
 * a generic auth card). Still follows the app's normal light/dark tokens --
 * no bespoke colors -- but the card itself is a translucent, backdrop-blurred
 * glass surface (`--login-glass-bg`/`--login-glass-border`/
 * `--shadow-login-glass` in globals.css, all `color-mix()` formulas over the
 * existing `--surface-2`/`--foreground`/`--primary` tokens) instead of the
 * shared `Panel`'s opaque surface, so it automatically reads as milky glass
 * in light and midnight glass in dark without any per-theme literals here.
 *
 * Google OAuth is the only real auth method here -- no email/password, no
 * registration, matching the read-only/Google-Sheets-source-of-truth
 * boundary for the whole product. OAuth behavior itself is untouched.
 */
export function LoginAuthPanel({ hasAuthError }: LoginAuthPanelProps) {
  return (
    <section className="relative flex flex-1 flex-col overflow-hidden bg-surface-3 lg:w-[38%]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(34rem 26rem at 50% 8%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 65%)",
        }}
      />

      <div className="relative flex items-center justify-end px-6 pt-5 sm:px-10 lg:px-8">
        <ThemeToggle />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-8 sm:px-10 lg:px-8">
        <div className="relative w-full max-w-sm">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-5 -z-10 rounded-[40px] opacity-60 blur-2xl animate-ambient-glow"
            style={{ background: "var(--login-glass-ambient)" }}
          />

          <div className="rounded-[32px] bg-[var(--login-glass-bg)] p-6 shadow-[var(--shadow-login-glass)] ring-1 ring-[var(--login-glass-border)] backdrop-blur-xl sm:p-7">
            <p className="text-sm font-semibold tracking-wide text-muted">{APP_NAME}</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">{LOGIN_WELCOME_HEADING}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{LOGIN_WELCOME_SUBTEXT}</p>

            {hasAuthError ? <LoginErrorNotice className="mt-5" /> : null}

            <div className="mt-6">
              <GoogleSignInButton />
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-2">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.75} />
              {LOGIN_AUTH_NOTE}
            </p>
          </div>
        </div>

        <p className="mt-6 text-[11px] text-muted-2">
          {APP_NAME} · גרסה {APP_VERSION}
        </p>
      </div>
    </section>
  );
}
