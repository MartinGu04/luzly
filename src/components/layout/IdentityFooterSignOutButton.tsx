"use client";

import { useFormStatus } from "react-dom";
import { Loader2, LogOut } from "lucide-react";
import { unsubscribeCurrentPushSubscription } from "@/lib/push/browserSubscription";

/**
 * `IdentityFooter`'s sign-out submit button, split into its own client
 * component so `useFormStatus` reflects the enclosing
 * `<form action={signOutAction}>`'s real pending state -- disabling the
 * button and swapping in a spinner for the network round trip, so a
 * second tap can't fire a duplicate sign-out.
 *
 * The `onClick` fires a best-effort, fire-and-forget local
 * `unsubscribeCurrentPushSubscription()` (PR #29) ALONGSIDE the normal
 * form submission -- it never calls `preventDefault()`, so it can never
 * delay or block sign-out. This is independent of (and races harmlessly
 * with) `signOutAction`'s own server-side subscription-row cleanup: this
 * one only talks to the browser's local Service Worker/push state, never
 * this app's own session/cookies.
 */
export function IdentityFooterSignOutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      onClick={() => {
        unsubscribeCurrentPushSubscription();
      }}
      aria-label={pending ? "מתנתק..." : "התנתקות"}
      aria-busy={pending}
      disabled={pending}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-critical/80 transition-colors duration-200 hover:bg-critical/10 hover:text-critical focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <Loader2 className="h-[16px] w-[16px] animate-spin" aria-hidden="true" strokeWidth={1.75} />
      ) : (
        <LogOut className="h-[16px] w-[16px]" aria-hidden="true" strokeWidth={1.75} />
      )}
    </button>
  );
}
