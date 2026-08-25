import { afterEach, describe, expect, it, vi } from "vitest";
import { isIosInstallableDevice, isStandaloneDisplayMode } from "./installState";

function stubUserAgent(userAgent: string) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
}

function stubPlatform(platform: string) {
  vi.spyOn(window.navigator, "platform", "get").mockReturnValue(platform);
}

function stubMaxTouchPoints(points: number) {
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: points, configurable: true });
}

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error -- test-only cleanup of a stubbed global.
  delete window.matchMedia;
  delete (window.navigator as { standalone?: boolean }).standalone;
  // @ts-expect-error -- test-only cleanup of the directly-defined (non-spy) stub above.
  delete window.navigator.maxTouchPoints;
});

describe("isStandaloneDisplayMode", () => {
  it("reports false when neither signal is present (an ordinary browser tab)", () => {
    stubMatchMedia(false);
    expect(isStandaloneDisplayMode()).toBe(false);
  });

  it("reports true via the (display-mode: standalone) media query", () => {
    stubMatchMedia(true);
    expect(isStandaloneDisplayMode()).toBe(true);
  });

  it("reports true via iOS's navigator.standalone even when the media query does not match", () => {
    stubMatchMedia(false);
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    expect(isStandaloneDisplayMode()).toBe(true);
  });

  it("never throws when matchMedia is unavailable (SSR-safe shape)", () => {
    // @ts-expect-error -- simulating an environment with no matchMedia.
    delete window.matchMedia;
    expect(() => isStandaloneDisplayMode()).not.toThrow();
    expect(isStandaloneDisplayMode()).toBe(false);
  });

  it("is never fooled into reporting standalone merely because Service Worker/Push APIs exist", () => {
    stubMatchMedia(false);
    // @ts-expect-error -- simulating a fully Push-capable, but NOT installed, browser tab.
    window.navigator.serviceWorker = {};
    // @ts-expect-error -- test-only stub.
    window.PushManager = function PushManager() {};
    expect(isStandaloneDisplayMode()).toBe(false);
    // @ts-expect-error -- test-only cleanup.
    delete window.navigator.serviceWorker;
    // @ts-expect-error -- test-only cleanup.
    delete window.PushManager;
  });
});

describe("isIosInstallableDevice", () => {
  it("detects a classic iPhone user agent", () => {
    stubUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    stubPlatform("iPhone");
    expect(isIosInstallableDevice()).toBe(true);
  });

  it("detects modern iPadOS identifying as desktop-class Safari (touch-capable MacIntel)", () => {
    stubUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15");
    stubPlatform("MacIntel");
    stubMaxTouchPoints(5);
    expect(isIosInstallableDevice()).toBe(true);
  });

  it("does not treat a real desktop Mac (no touch points) as an iOS install candidate", () => {
    stubUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15");
    stubPlatform("MacIntel");
    stubMaxTouchPoints(0);
    expect(isIosInstallableDevice()).toBe(false);
  });

  it("does not treat an ordinary Android/desktop Chrome as an iOS install candidate", () => {
    stubUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36");
    stubPlatform("Linux armv8l");
    expect(isIosInstallableDevice()).toBe(false);
  });
});
