"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deletePushSubscriptionForCurrentUser } from "@/lib/notifications/subscriptionStore";

/** Push cleanup must never delay/block sign-out -- bounded so even a hanging network call can't stall the redirect. */
const PUSH_CLEANUP_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/**
 * Signs out server-side and redirects to /login. Used directly as a form
 * action so it works with no client JS: `<form action={signOutAction}>`.
 *
 * PR #29: subscriptions are user-specific, so on a shared device a stale
 * subscription must not keep receiving this account's push notifications
 * after logout. `IdentityFooter`/`MobileProfileMenu` each render a
 * `PushEndpointHiddenField` inside the sign-out form, carrying the
 * current device's push endpoint (if any) here as plain form data --
 * best-effort deleted BEFORE `auth.signOut()`, while the session (and
 * therefore RLS's `auth.uid()`) is still valid; deleting after sign-out
 * would fail every time (no session left to authorize it under RLS). Any
 * failure here -- missing endpoint, no matching row, a slow/erroring
 * Supabase call -- is swallowed: sign-out always proceeds regardless.
 * The corresponding BROWSER-side unsubscribe happens separately, from
 * the sign-out button's own click handler (see
 * `IdentityFooterSignOutButton`/`MobileProfileMenu`'s `SignOutMenuItem`) --
 * a local operation, independent of this server round trip.
 */
export async function signOutAction(formData?: FormData) {
  const pushEndpoint = formData?.get("pushEndpoint");
  if (typeof pushEndpoint === "string" && pushEndpoint.length > 0) {
    await withTimeout(deletePushSubscriptionForCurrentUser(pushEndpoint), PUSH_CLEANUP_TIMEOUT_MS).catch(() => {});
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
