import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

class FakeWebPushError extends Error {
  statusCode: number;
  headers = {};
  body = "";
  endpoint = "https://push.example/endpoint";
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

vi.mock("web-push", () => ({
  sendNotification: (...args: unknown[]) => sendNotification(...args),
  setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  WebPushError: FakeWebPushError,
}));

const ENV_KEYS = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function configureVapidEnv() {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
  process.env.VAPID_SUBJECT = "mailto:test@example.invalid";
}

const { sendPush } = await import("./sendPush");
const { buildNotificationPayload } = await import("./payload");

const SUBSCRIPTION = { endpoint: "https://push.example/endpoint", p256dh: "p256dh-key", auth: "auth-key" };
const PAYLOAD = buildNotificationPayload({ title: "t", body: "b" });

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("sendPush -- VAPID not configured", () => {
  it("returns a clean transient failure instead of throwing when VAPID env vars are missing", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const { sendPush: freshSendPush } = await import("./sendPush");

    const result = await freshSendPush(SUBSCRIPTION, PAYLOAD);
    expect(result).toEqual({ ok: false, permanent: false, message: expect.stringContaining("VAPID") });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("sendPush -- success", () => {
  it("sends the serialized payload to the subscription's endpoint/keys", async () => {
    configureVapidEnv();
    sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });

    const result = await sendPush(SUBSCRIPTION, PAYLOAD);

    expect(result).toEqual({ ok: true });
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: SUBSCRIPTION.p256dh, auth: SUBSCRIPTION.auth } },
      JSON.stringify(PAYLOAD),
    );
  });

  it("configures VAPID details exactly once across multiple sends", async () => {
    configureVapidEnv();
    sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    // A fresh module instance so this test's call count isn't affected by
    // the module-level `vapidConfigured` memoization already having been
    // tripped by an earlier test in this file.
    const { sendPush: freshSendPush } = await import("./sendPush");

    await freshSendPush(SUBSCRIPTION, PAYLOAD);
    await freshSendPush(SUBSCRIPTION, PAYLOAD);

    expect(setVapidDetails).toHaveBeenCalledTimes(1);
    expect(setVapidDetails).toHaveBeenCalledWith("mailto:test@example.invalid", "test-public-key", "test-private-key");
  });
});

describe("sendPush -- permanent failure classification", () => {
  it.each([404, 410])("status %d is classified as permanent", async (statusCode) => {
    configureVapidEnv();
    sendNotification.mockRejectedValue(new FakeWebPushError("gone", statusCode));

    const result = await sendPush(SUBSCRIPTION, PAYLOAD);
    expect(result).toEqual({ ok: false, permanent: true, statusCode, message: expect.any(String) });
  });
});

describe("sendPush -- transient failure classification", () => {
  it.each([429, 500, 502, 503])("status %d is classified as transient, never permanent", async (statusCode) => {
    configureVapidEnv();
    sendNotification.mockRejectedValue(new FakeWebPushError("try again", statusCode));

    const result = await sendPush(SUBSCRIPTION, PAYLOAD);
    expect(result).toEqual({ ok: false, permanent: false, statusCode, message: expect.any(String) });
  });

  it("a raw network/timeout error (no statusCode) is classified as transient", async () => {
    configureVapidEnv();
    sendNotification.mockRejectedValue(new Error("ECONNRESET"));

    const result = await sendPush(SUBSCRIPTION, PAYLOAD);
    expect(result).toEqual({ ok: false, permanent: false, message: expect.any(String) });
  });
});

describe("sendPush -- never logs sensitive data", () => {
  it("console.error output never contains the endpoint, keys, or payload body text", async () => {
    configureVapidEnv();
    sendNotification.mockRejectedValue(new FakeWebPushError("gone", 410));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendPush(SUBSCRIPTION, PAYLOAD);

    for (const call of consoleSpy.mock.calls) {
      const line = call.join(" ");
      expect(line).not.toContain(SUBSCRIPTION.endpoint);
      expect(line).not.toContain(SUBSCRIPTION.p256dh);
      expect(line).not.toContain(SUBSCRIPTION.auth);
      expect(line).not.toContain(PAYLOAD.body);
    }
    consoleSpy.mockRestore();
  });
});
