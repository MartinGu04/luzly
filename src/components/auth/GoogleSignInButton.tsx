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
      className={`flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-login-cta)] transition-all duration-200 hover:bg-primary-strong hover:shadow-[var(--shadow-login-cta-hover)] active:scale-[0.985] active:shadow-[var(--shadow-login-cta-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-[var(--shadow-login-cta)] disabled:hover:bg-primary disabled:active:scale-100 ${className}`}
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
