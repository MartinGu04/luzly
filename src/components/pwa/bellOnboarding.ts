import type { PushUiState } from "./usePushSubscription";

/**
 * What the install-guidance UI should show, independent of whether the
 * caller is the bell's automatic (dismissible, cooldown-gated) card or the
 * Notification Settings' manual (always-available) entry point -- see
 * `deriveBellOnboardingCard` and `NotificationBell`'s `SettingsView` for
 * the two call sites. Priority: an install completed THIS session always
 * wins (truthful next-step, not a repeat pitch); then device-appropriate
 * guidance; a browser with neither a native prompt nor iOS gets only the
 * truthful low-key fallback note, never a dead "Install" button.
 */
export type InstallGuidance = "completed" | "ios" | "native" | "fallback";

export function deriveInstallGuidance(input: { isIos: boolean; canPromptInstall: boolean; installCompleted: boolean }): InstallGuidance {
  if (input.installCompleted) return "completed";
  if (input.isIos) return "ios";
  if (input.canPromptInstall) return "native";
  return "fallback";
}

/**
 * The bell's contextual onboarding card (spec priority A-G) -- pure and
 * independently testable from the actual popover JSX. Never itself reaches
 * into `localStorage`/`window`; every input is a plain value the caller
 * (`NotificationBell`) already derived from `usePwaInstall()`,
 * `usePushSubscription()`, and `installPromptPreference.ts`.
 */
export type BellOnboardingCard =
  | { kind: "none" }
  | { kind: "enable_push" }
  | { kind: "push_blocked" }
  | { kind: "install"; guidance: Exclude<InstallGuidance, "completed"> }
  | { kind: "install_completed" };

export interface BellOnboardingInput {
  /**
   * `PwaInstallProvider`'s one-time environment detection (standalone
   * display mode + iOS/iPad) has not finished yet -- true only for the
   * server render and the client's first pre-hydration render, briefly,
   * before its detection effect runs. `isStandalone`/`isIos` cannot be
   * trusted while this is `false`, so no card is derived at all until it
   * flips -- never a guess that might immediately turn out wrong right
   * after hydration.
   */
  isReady: boolean;
  isStandalone: boolean;
  pushState: PushUiState;
  isIos: boolean;
  canPromptInstall: boolean;
  installCompleted: boolean;
  installDismissalActive: boolean;
}

export function deriveBellOnboardingCard(input: BellOnboardingInput): BellOnboardingCard {
  const { isReady, isStandalone, pushState, isIos, canPromptInstall, installCompleted, installDismissalActive } = input;

  if (!isReady) return { kind: "none" };

  if (isStandalone) {
    // (A) enabled/disabling -> no card, normal inbox. (B) not yet enabled ->
    // prompt to enable. (C) denied -> blocked guidance. Any other push
    // state (checking/unsupported) while standalone gets no card here --
    // `checking` is a brief loading flicker not worth a card, and a
    // genuinely unsupported standalone runtime still gets its existing
    // truthful `UnsupportedPanel` in Settings.
    if (pushState === "not_enabled" || pushState === "enabling") return { kind: "enable_push" };
    if (pushState === "permission_denied") return { kind: "push_blocked" };
    return { kind: "none" };
  }

  const guidance = deriveInstallGuidance({ isIos, canPromptInstall, installCompleted });
  // (F) A completed install is truthful, one-time guidance -- never subject
  // to the "don't nag" dismissal cooldown (there is nothing to nag about).
  if (guidance === "completed") return { kind: "install_completed" };
  // (D/E) Only the device-specific install pitches (native/iOS) respect the
  // dismissal cooldown. (G) The low-key fallback note is never gated --
  // it carries no CTA to nag with in the first place.
  if (guidance !== "fallback" && installDismissalActive) return { kind: "none" };
  return { kind: "install", guidance };
}
