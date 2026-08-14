"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { GoogleGlyph } from "./GoogleGlyph";

interface GoogleSignInButtonProps {
  className?: string;
}

/**
 * The one real authentication action in the app. `pending` both drives the
 * "מתחבר..." feedback state and disables the button, so a double click (or
 * the round trip to Google) can never fire `signInWithOAuth` twice. OAuth
 * behavior itself (provider, redirect target, Supabase flow) is unchanged
 * from before the Design Pass -- this only redresses the button.
 *
 * Two visual treatments, chosen for contrast against their surroundings
 * (Design Pass PR #22 "immersive composition" pass, §6): below `lg`, the
 * login canvas is always dark, so the CTA is a light/milky surface with a
 * dark label -- a clear focal point against the midnight background and
 * glass card. At `lg`+ (the approved desktop split, theme-responsive auth
 * side), it reverts to the violet product-accent treatment.
 */
export function GoogleSignInButton({ className = "" }: GoogleSignInButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleSignIn() {
    if (pending) return;
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={pending}
      aria-busy={pending}
      className={`flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-[var(--login-cta-fixed-bg)] px-4 text-[15px] font-semibold text-[var(--login-cta-fixed-text)] shadow-[var(--shadow-login-cta-fixed)] transition-all duration-200 hover:bg-[var(--login-cta-fixed-bg-hover)] hover:shadow-[var(--shadow-login-cta-fixed-hover)] active:scale-[0.985] active:shadow-[var(--shadow-login-cta-fixed-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-[var(--shadow-login-cta-fixed)] disabled:hover:bg-[var(--login-cta-fixed-bg)] disabled:active:scale-100 lg:bg-primary lg:text-primary-foreground lg:shadow-[var(--shadow-login-cta)] lg:hover:bg-primary-strong lg:hover:shadow-[var(--shadow-login-cta-hover)] lg:active:shadow-[var(--shadow-login-cta-active)] lg:disabled:shadow-[var(--shadow-login-cta)] lg:disabled:hover:bg-primary ${className}`}
    >
      {pending ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" strokeWidth={2} />
          <span>מתחבר...</span>
        </>
      ) : (
        <>
          <GoogleGlyph className="h-5 w-5" />
          <span>המשך עם Google</span>
        </>
      )}
    </button>
  );
}
