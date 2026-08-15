"use client";

import { useEffect, useState } from "react";
import { getCurrentPushEndpoint } from "@/lib/push/browserSubscription";

/**
 * A hidden form field carrying the current device's push subscription
 * endpoint (if any) into `signOutAction` (PR #29's logout push cleanup),
 * WITHOUT changing the sign-out `<form action={signOutAction}>` itself
 * away from a plain, no-JS-capable form submission -- see that action's
 * own docstring for why the delete must happen server-side, before the
 * session is invalidated.
 *
 * Resolved eagerly on mount (not on submit): `getCurrentPushEndpoint()`
 * has no network round trip (it only reads local Service Worker/Push
 * state), so it reliably finishes well before a user actually reaches
 * for the sign-out button. If it hasn't resolved by the time they click
 * anyway, the field stays empty and `signOutAction` simply skips the
 * best-effort cleanup for that one logout -- sign-out itself is
 * completely unaffected either way.
 */
export function PushEndpointHiddenField() {
  const [endpoint, setEndpoint] = useState("");

  useEffect(() => {
    let cancelled = false;
    getCurrentPushEndpoint().then((value) => {
      if (!cancelled && value) setEndpoint(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <input type="hidden" name="pushEndpoint" value={endpoint} readOnly />;
}
