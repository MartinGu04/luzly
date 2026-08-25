/**
 * PWA install-state primitives (contextual install onboarding) -- pure
 * runtime detection, plus the `beforeinstallprompt` event shape, kept
 * completely separate from Push subscription state (`usePushSubscription`)
 * and from the existing read-only capability checks in
 * `lib/pwa/capabilities.ts` (Service Worker/Push/Notification support is a
 * different question from "is this window actually running installed").
 *
 * Every function guards for a missing `window`/`navigator` first, same
 * convention as `capabilities.ts`, so importing/calling this during SSR
 * simply reports "not standalone"/"not iOS" instead of throwing.
 */

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

/**
 * `navigator.standalone` is an iOS Safari-only extension, not part of
 * `lib.dom`'s `Navigator` type -- narrowed locally via this interface
 * (rather than a global `declare global` augmentation) so the rest of the
 * codebase's `Navigator` type stays exactly what `lib.dom` says it is.
 */
interface NavigatorWithIosStandalone extends Navigator {
  standalone?: boolean;
}

/**
 * True runtime standalone/installed detection -- the ONLY two real
 * signals: the `display-mode: standalone` media query (the standard,
 * cross-browser check) and iOS Safari's own `navigator.standalone` flag
 * (iOS never reports a matching `display-mode`). Deliberately does not
 * consult Service Worker/Push/manifest support -- those describe what the
 * browser CAN do, not whether the user actually installed anything.
 */
export function isStandaloneDisplayMode(): boolean {
  if (!isBrowser()) return false;
  const matchesDisplayMode = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as NavigatorWithIosStandalone).standalone === true;
  return matchesDisplayMode || iosStandalone;
}

/**
 * iPhone/iPad manual-install detection -- for choosing INSTRUCTIONS only,
 * never for security/authorization/Push-capability decisions (Push
 * capability is still decided purely by `lib/pwa/capabilities.ts`'s real
 * feature checks). Covers the classic `userAgent`/`platform` match AND
 * modern iPadOS, which identifies as desktop-class Safari
 * (`platform === "MacIntel"`) but stays touch-capable, unlike an actual
 * Mac (`maxTouchPoints > 1`).
 */
export function isIosInstallableDevice(): boolean {
  if (!isBrowser()) return false;
  const ua = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  const isClassicIphoneOrIpad = /iPhone|iPad|iPod/.test(ua) || /iPhone|iPad|iPod/.test(platform);
  const isIpadOsDesktopClassSafari = platform === "MacIntel" && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  return isClassicIphoneOrIpad || isIpadOsDesktopClassSafari;
}

/**
 * The non-standard `beforeinstallprompt` event (Chromium/Android-family
 * browsers only -- no `lib.dom` type exists for it). `prompt()` must only
 * ever be called from a real user click, and each event instance can only
 * be prompted once -- see `PwaInstallProvider.promptInstall`.
 */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}
