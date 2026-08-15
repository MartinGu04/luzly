"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPwaCapabilities } from "@/lib/pwa/capabilities";
import { urlBase64ToUint8Array } from "@/lib/push/base64url";
import { getVapidPublicKey } from "@/lib/push/publicConfig";
import {
  disablePushNotificationsAction,
  enablePushNotificationsAction,
  getPushSubscriptionStatusAction,
  sendTestNotificationAction,
} from "@/lib/notifications/actions";

export type PushUiState =
  | "unsupported"
  | "checking"
  | "not_enabled"
  | "permission_denied"
  | "enabling"
  | "enabled"
  | "disabling";

export type TestPushStatus = "idle" | "pending" | "success" | "error";

const GENERIC_ENABLE_ERROR = "לא ניתן היה להפעיל התראות. נסו שוב מאוחר יותר.";

/**
 * Looks up the current browser-level `PushSubscription`, if any, without
 * ever waiting indefinitely -- `getRegistration()` resolves to `undefined`
 * immediately when nothing is registered yet, unlike
 * `navigator.serviceWorker.ready` (which never resolves at all with no
 * registration). Safe to call on mount for a passive status check.
 */
async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

/**
 * All Web Push subscription state/actions for the current device --
 * backs `NotificationBell`. Deliberately does NOT equate browser
 * `Notification.permission === "granted"` with "this device is
 * subscribed to מי-מה-מו": a device can have permission granted yet no
 * active `PushSubscription`, and -- the important shared-device case --
 * a leftover browser `PushSubscription` from a PREVIOUS account is never
 * treated as active for a newly logged-in different user. "enabled" is
 * only ever reported once BOTH the local browser subscription exists AND
 * the server confirms (`getPushSubscriptionStatusAction`, RLS-scoped to
 * whoever is authenticated right now) a matching row for the CURRENT
 * user. See `enable()`: the permission prompt is requested only inside
 * this function, itself only ever invoked from the button's own click
 * handler -- never on mount, never automatically.
 */
export function usePushSubscription() {
  const [state, setState] = useState<PushUiState>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<TestPushStatus>("idle");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const recheckStatus = useCallback(async () => {
    const capabilities = getPwaCapabilities();
    if (!capabilities.serviceWorker || !capabilities.pushManager || !capabilities.notifications) {
      if (mountedRef.current) setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      if (mountedRef.current) setState("permission_denied");
      return;
    }

    const subscription = await getCurrentSubscription();
    if (!subscription) {
      if (mountedRef.current) setState("not_enabled");
      return;
    }

    const status = await getPushSubscriptionStatusAction(subscription.endpoint);
    if (!mountedRef.current) return;
    setState(status.subscribed ? "enabled" : "not_enabled");
  }, []);

  useEffect(() => {
    recheckStatus();
  }, [recheckStatus]);

  const enable = useCallback(async () => {
    setErrorMessage(null);
    setState("enabling");

    try {
      const capabilities = getPwaCapabilities();
      if (!capabilities.serviceWorker || !capabilities.pushManager || !capabilities.notifications) {
        setState("unsupported");
        return;
      }

      // The ONLY place this app ever calls requestPermission() -- always
      // directly from this function, itself only ever invoked by the
      // "הפעל התראות" button's own click handler.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "permission_denied" : "not_enabled");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          // `lib.dom`'s `PushSubscriptionOptionsInit.applicationServerKey`
          // wants a `BufferSource` typed over plain `ArrayBuffer`, while a
          // freshly-constructed `Uint8Array`'s inferred type is generic
          // over `ArrayBufferLike` (which also covers `SharedArrayBuffer`)
          // -- a TypeScript/lib.dom strictness mismatch, not a real runtime
          // concern (this is always a genuine local `ArrayBuffer`).
          applicationServerKey: urlBase64ToUint8Array(getVapidPublicKey()) as BufferSource,
        });
      }

      const result = await enablePushNotificationsAction(subscription.toJSON());
      if (!mountedRef.current) return;
      if (!result.ok) {
        setErrorMessage(GENERIC_ENABLE_ERROR);
        setState("not_enabled");
        return;
      }
      setState("enabled");
    } catch {
      if (!mountedRef.current) return;
      setErrorMessage(GENERIC_ENABLE_ERROR);
      setState("not_enabled");
    }
  }, []);

  const disable = useCallback(async () => {
    setState("disabling");
    try {
      const subscription = await getCurrentSubscription();
      if (subscription) {
        await disablePushNotificationsAction(subscription.endpoint).catch(() => {});
        await subscription.unsubscribe().catch(() => {});
      }
    } finally {
      // Re-derive the TRUTHFUL state rather than assuming the above
      // succeeded -- if either side silently failed, this reflects
      // reality instead of a claimed outcome.
      await recheckStatus();
      if (mountedRef.current) setTestStatus("idle");
    }
  }, [recheckStatus]);

  const sendTest = useCallback(async () => {
    setTestStatus("pending");
    try {
      const subscription = await getCurrentSubscription();
      if (!subscription) {
        if (mountedRef.current) setTestStatus("error");
        return;
      }
      const result = await sendTestNotificationAction(subscription.endpoint);
      if (!mountedRef.current) return;
      if (!result.ok) {
        setTestStatus("error");
        if (result.error === "subscription_expired" || result.error === "not_subscribed") {
          await recheckStatus();
        }
        return;
      }
      setTestStatus("success");
    } catch {
      if (mountedRef.current) setTestStatus("error");
    }
  }, [recheckStatus]);

  return { state, errorMessage, testStatus, enable, disable, sendTest };
}
