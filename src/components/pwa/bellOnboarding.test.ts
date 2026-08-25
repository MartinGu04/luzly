import { describe, expect, it } from "vitest";
import { deriveBellOnboardingCard, deriveInstallGuidance } from "./bellOnboarding";

const BASE = {
  isStandalone: false,
  pushState: "not_enabled" as const,
  isIos: false,
  canPromptInstall: false,
  installCompleted: false,
  installDismissalActive: false,
};

describe("deriveInstallGuidance", () => {
  it("prioritizes a session-completed install over anything else", () => {
    expect(deriveInstallGuidance({ isIos: true, canPromptInstall: true, installCompleted: true })).toBe("completed");
  });

  it("prefers iOS instructions over a native prompt when both would apply", () => {
    expect(deriveInstallGuidance({ isIos: true, canPromptInstall: true, installCompleted: false })).toBe("ios");
  });

  it("offers the native prompt on a non-iOS browser that captured beforeinstallprompt", () => {
    expect(deriveInstallGuidance({ isIos: false, canPromptInstall: true, installCompleted: false })).toBe("native");
  });

  it("falls back to the truthful low-key note otherwise", () => {
    expect(deriveInstallGuidance({ isIos: false, canPromptInstall: false, installCompleted: false })).toBe("fallback");
  });
});

describe("deriveBellOnboardingCard — standalone branch (A/B/C)", () => {
  it("(A) standalone + Push enabled -> no card", () => {
    expect(deriveBellOnboardingCard({ ...BASE, isStandalone: true, pushState: "enabled" })).toEqual({ kind: "none" });
  });

  it("(A) standalone + Push disabling (still effectively on) -> no card", () => {
    expect(deriveBellOnboardingCard({ ...BASE, isStandalone: true, pushState: "disabling" })).toEqual({ kind: "none" });
  });

  it("(B) standalone + Push not_enabled -> enable_push card", () => {
    expect(deriveBellOnboardingCard({ ...BASE, isStandalone: true, pushState: "not_enabled" })).toEqual({ kind: "enable_push" });
  });

  it("(B) standalone + Push enabling -> still the enable_push card (pending state)", () => {
    expect(deriveBellOnboardingCard({ ...BASE, isStandalone: true, pushState: "enabling" })).toEqual({ kind: "enable_push" });
  });

  it("(C) standalone + permission denied -> push_blocked card", () => {
    expect(deriveBellOnboardingCard({ ...BASE, isStandalone: true, pushState: "permission_denied" })).toEqual({ kind: "push_blocked" });
  });

  it("standalone + checking -> no card (avoid a loading-state flash)", () => {
    expect(deriveBellOnboardingCard({ ...BASE, isStandalone: true, pushState: "checking" })).toEqual({ kind: "none" });
  });

  it("standalone + genuinely unsupported -> no bell card (Settings still shows the truthful unsupported panel)", () => {
    expect(deriveBellOnboardingCard({ ...BASE, isStandalone: true, pushState: "unsupported" })).toEqual({ kind: "none" });
  });

  it("standalone mode never shows install prompting regardless of install/dismissal inputs", () => {
    expect(
      deriveBellOnboardingCard({
        ...BASE,
        isStandalone: true,
        pushState: "enabled",
        isIos: true,
        canPromptInstall: true,
        installCompleted: false,
        installDismissalActive: false,
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("deriveBellOnboardingCard — not standalone branch (D/E/F/G)", () => {
  it("(F) install completed this session but tab still not standalone -> install_completed, even on iOS with a captured prompt", () => {
    expect(deriveBellOnboardingCard({ ...BASE, installCompleted: true, isIos: true, canPromptInstall: true })).toEqual({
      kind: "install_completed",
    });
  });

  it("(E) iOS + not standalone -> install card with iOS guidance", () => {
    expect(deriveBellOnboardingCard({ ...BASE, isIos: true })).toEqual({ kind: "install", guidance: "ios" });
  });

  it("(E) iOS + standalone -> no install card at all", () => {
    expect(deriveBellOnboardingCard({ ...BASE, isStandalone: true, pushState: "enabled", isIos: true })).toEqual({ kind: "none" });
  });

  it("(D) non-iOS + native deferred prompt -> install card with native guidance", () => {
    expect(deriveBellOnboardingCard({ ...BASE, canPromptInstall: true })).toEqual({ kind: "install", guidance: "native" });
  });

  it("(G) non-iOS + no deferred prompt -> install card with the fallback (never a dead Install button, never gated by dismissal)", () => {
    expect(deriveBellOnboardingCard({ ...BASE, installDismissalActive: true })).toEqual({ kind: "install", guidance: "fallback" });
  });

  it("(D) dismissal cooldown suppresses the native card entirely", () => {
    expect(deriveBellOnboardingCard({ ...BASE, canPromptInstall: true, installDismissalActive: true })).toEqual({ kind: "none" });
  });

  it("(E) dismissal cooldown suppresses the iOS card entirely", () => {
    expect(deriveBellOnboardingCard({ ...BASE, isIos: true, installDismissalActive: true })).toEqual({ kind: "none" });
  });

  it("an expired cooldown (installDismissalActive: false) lets the native card appear again", () => {
    expect(deriveBellOnboardingCard({ ...BASE, canPromptInstall: true, installDismissalActive: false })).toEqual({
      kind: "install",
      guidance: "native",
    });
  });
});
