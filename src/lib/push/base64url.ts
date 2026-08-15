/**
 * Converts a VAPID public key (URL-safe base64, no padding -- the format
 * `web-push generate-vapid-keys` and `PushManager.subscribe()` both use)
 * into the raw `Uint8Array` `applicationServerKey` expects. Pure, DOM-free
 * -- usable both in the browser and in tests.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
