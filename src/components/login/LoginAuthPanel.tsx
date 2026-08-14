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
 * The login route's authentication content (Design Pass PR #22,
 * recomposed for "immersive composition" -- the glass card now floats
 * INSIDE the same continuous canvas as the hero, rather than sitting on a
 * separately-colored section below it).
 *
 * Below `lg`, this panel has no opaque background of its own -- the
 * shared midnight canvas painted by the root `page.tsx` wrapper shows
 * straight through, and the card/text here use the FIXED (theme-
 * independent) `--login-*-fixed` tokens from globals.css so the mobile
 * login stays one consistent dark branded surface regardless of the
 * user's Light/Dark preference (that preference still applies to the
 * rest of the app once signed in). At `lg`+, every `lg:` class below
 * reverts to the normal theme-responsive tokens for the approved desktop
 * split, where the auth side legitimately follows Light/Dark.
 *
 * Google OAuth is the only real auth method here -- no email/password, no
 * registration, matching the read-only/Google-Sheets-source-of-truth
 * boundary for the whole product. OAuth behavior itself is untouched.
 */
export function LoginAuthPanel({ hasAuthError }: LoginAuthPanelProps) {
  return (
    <section className="relative flex flex-1 flex-col overflow-hidden lg:bg-surface-3 lg:w-[38%]">
      {/* Desktop-only: an ambient violet glow anchored near this panel's
          boundary-adjacent edge (physically its right edge -- this panel
          renders second/left in the RTL split, so "near the hero" means
          "near 100%" here), so some of the hero's own indigo/violet energy
          visually bridges the seam instead of the auth side reading as a
          flat isolated panel (Design Pass PR #22 "immersive composition"
          pass, §10). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 hidden lg:block"
        style={{
          backgroundImage:
            "radial-gradient(38rem 30rem at 88% 10%, color-mix(in srgb, var(--primary) 13%, transparent), transparent 62%)",
        }}
      />

      <div className="relative flex items-center justify-end px-6 pt-5 sm:px-10 lg:px-8">
        <div className="lg:hidden">
          <ThemeToggle variant="sidebar" />
        </div>
        <div className="hidden lg:block">
          <ThemeToggle />
        </div>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-8 sm:px-10 lg:px-8">
        <div className="relative w-full max-w-sm">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-5 -z-10 rounded-[40px] opacity-60 blur-2xl animate-ambient-glow"
            style={{ background: "var(--login-glass-ambient)" }}
          />

          <div className="rounded-[32px] bg-[var(--login-glass-bg-fixed)] p-6 shadow-[var(--shadow-login-glass-fixed)] ring-1 ring-[var(--login-glass-border-fixed)] backdrop-blur-xl sm:p-7 lg:bg-[var(--login-glass-bg)] lg:shadow-[var(--shadow-login-glass)] lg:ring-[var(--login-glass-border)]">
            <p className="text-sm font-semibold tracking-wide text-[var(--login-muted-fixed)] lg:text-muted">
              {APP_NAME}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[var(--login-fg-fixed)] lg:text-foreground">
              {LOGIN_WELCOME_HEADING}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--login-muted-fixed)] lg:text-muted">
              {LOGIN_WELCOME_SUBTEXT}
            </p>

            {hasAuthError ? <LoginErrorNotice className="mt-5" /> : null}

            <div className="mt-6">
              <GoogleSignInButton />
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[var(--login-muted-2-fixed)] lg:text-muted-2">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.75} />
              {LOGIN_AUTH_NOTE}
            </p>
          </div>
        </div>

        <p className="mt-6 text-[11px] text-[var(--login-muted-2-fixed)] lg:text-muted-2">
          {APP_NAME} · גרסה {APP_VERSION}
        </p>
      </div>
    </section>
  );
}
