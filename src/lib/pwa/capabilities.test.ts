import { afterEach, describe, expect, it } from "vitest";
import {
  getPwaCapabilities,
  supportsNotifications,
  supportsPushManager,
  supportsServiceWorker,
} from "./capabilities";

/**
 * jsdom (this project's test environment) does not implement
 * ServiceWorker/PushManager/Notification at all, so by default every
 * check here should already report `false` -- these tests both confirm
 * that "unsupported environment never throws" baseline AND, by stubbing
 * the API onto `navigator`/`window`, confirm detection flips to `true`
 * once the real API is present, without ever touching a real permission
 * prompt or registration.
 */
describe("PWA capability detection (PR #28)", () => {
  afterEach(() => {
    // @ts-expect-error -- test-only cleanup of a stubbed global.
    delete window.PushManager;
    // @ts-expect-error -- test-only cleanup of a stubbed global.
    delete window.Notification;
    // @ts-expect-error -- test-only cleanup of a stubbed global.
    delete navigator.serviceWorker;
  });

  it("reports every capability as unsupported in a plain jsdom environment, without throwing", () => {
    expect(() => getPwaCapabilities()).not.toThrow();
    expect(getPwaCapabilities()).toEqual({
      serviceWorker: false,
      pushManager: false,
      notifications: false,
    });
  });

  it("detects ServiceWorker support once 'serviceWorker' exists on navigator", () => {
    expect(supportsServiceWorker()).toBe(false);
    // @ts-expect-error -- simulating a supporting browser for this test only.
    navigator.serviceWorker = {};
    expect(supportsServiceWorker()).toBe(true);
  });

  it("detects PushManager support once it exists on window", () => {
    expect(supportsPushManager()).toBe(false);
    // @ts-expect-error -- simulating a supporting browser for this test only.
    window.PushManager = function PushManager() {};
    expect(supportsPushManager()).toBe(true);
  });

  it("detects Notification support once it exists on window", () => {
    expect(supportsNotifications()).toBe(false);
    // @ts-expect-error -- simulating a supporting browser for this test only.
    window.Notification = function Notification() {};
    expect(supportsNotifications()).toBe(true);
  });

  it("getPwaCapabilities reflects all three independently", () => {
    // @ts-expect-error -- simulating a supporting browser for this test only.
    navigator.serviceWorker = {};
    // @ts-expect-error -- simulating a supporting browser for this test only.
    window.PushManager = function PushManager() {};
    expect(getPwaCapabilities()).toEqual({
      serviceWorker: true,
      pushManager: true,
      notifications: false,
    });
  });
});
