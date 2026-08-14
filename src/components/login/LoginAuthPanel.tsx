import { Lock } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Panel } from "@/components/ui/Panel";
import { APP_VERSION } from "@/lib/config/appVersion";
import { APP_NAME } from "@/lib/config/productName";
import { LOGIN_AUTH_NOTE, LOGIN_WELCOME_HEADING, LOGIN_WELCOME_SUBTEXT } from "@/lib/config/loginCopy";
import { LoginErrorNotice } from "./LoginErrorNotice";

interface LoginAuthPanelProps {
  hasAuthError: boolean;
}

/**
 * The login route's calm, non-competing authentication side (Design Pass
 * PR #22). Unlike the visual side, this one follows the app's normal
 * light/dark tokens -- `bg-surface-3` (soft off-white in light, deep
 * graphite/navy in dark) behind a `Panel variant="hero"` card, giving the
 * same layered-surface feel in both themes without any bespoke colors.
 *
 * Google OAuth is the only real auth method here -- no email/password, no
 * registration, matching the read-only/Google-Sheets-source-of-truth
 * boundary for the whole product.
 */
export function LoginAuthPanel({ hasAuthError }: LoginAuthPanelProps) {
  return (
    <section className="relative flex flex-1 flex-col bg-surface-3 lg:w-[38%]">
      <div className="flex items-center justify-end px-6 pt-5 sm:px-10 lg:px-8">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 sm:px-10 lg:px-8">
        <Panel variant="hero" className="w-full max-w-sm">
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
        </Panel>

        <p className="mt-6 text-[11px] text-muted-2">
          {APP_NAME} · גרסה {APP_VERSION}
        </p>
      </div>
    </section>
  );
}
