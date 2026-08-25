import "client-only";

const STORAGE_KEY_PREFIX = "mi-ma-mo:install-prompt-dismissed:";

/** V1 cooldown (spec: "install onboarding" section 7) -- 7 days. */
export const INSTALL_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Device-local dismissal for the AUTOMATIC contextual install card only
 * (`NotificationBell`'s onboarding card) -- a completely separate concern
 * and a completely separate storage key from `lib/notifications/pushPreference.ts`'s
 * Push opt-in preference. Keyed by the authenticated `userId`, same
 * per-account-on-a-shared-device isolation `pushPreference.ts` already
 * establishes, so one account dismissing the install card on a shared
 * browser can never suppress it for a different account that later signs
 * in on the same device.
 */
function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

/** Reads this device's last dismissal timestamp (ms since epoch) for one user, or `null` if never dismissed / storage unavailable / a corrupt stored value. Never throws. */
export function readInstallPromptDismissedAt(userId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Best-effort write -- a failure (private mode, quota, disabled storage) must never break the "לא עכשיו" click itself; the dismissal simply won't survive a reload on this device. */
export function markInstallPromptDismissed(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), String(Date.now()));
  } catch {
    // Intentionally ignored -- see docstring above.
  }
}

/** Whether a stored dismissal is still within the cooldown window. Pure -- takes `now` explicitly so it stays trivially testable without faking the system clock. */
export function isInstallPromptDismissalActive(dismissedAt: number | null, now: number = Date.now()): boolean {
  if (dismissedAt === null) return false;
  return now - dismissedAt < INSTALL_PROMPT_COOLDOWN_MS;
}
