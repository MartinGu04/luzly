import { describe, expect, it } from "vitest";
import { parseBrowserSubscription } from "./subscriptionValidation";

const VALID_P256DH = "B".repeat(87);
const VALID_AUTH = "a".repeat(22);

function validRawSubscription() {
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    expirationTime: null,
  };
}

describe("parseBrowserSubscription -- valid input", () => {
  it("accepts a well-formed subscription", () => {
    const result = parseBrowserSubscription(validRawSubscription());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subscription).toEqual({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        p256dh: VALID_P256DH,
        auth: VALID_AUTH,
        expirationTime: null,
      });
    }
  });

  it("accepts a numeric expirationTime", () => {
    const raw = { ...validRawSubscription(), expirationTime: 1750000000000 };
    const result = parseBrowserSubscription(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.subscription.expirationTime).toBe(1750000000000);
  });

  it("accepts a missing expirationTime field (defaults to null)", () => {
    const raw = validRawSubscription() as Record<string, unknown>;
    delete raw.expirationTime;
    const result = parseBrowserSubscription(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.subscription.expirationTime).toBeNull();
  });
});

describe("parseBrowserSubscription -- fails closed on malformed input", () => {
  it.each([
    ["null", null],
    ["a string", "not-an-object"],
    ["a number", 42],
    ["an array", []],
    ["undefined", undefined],
  ])("rejects %s as the top-level value", (_label, value) => {
    expect(parseBrowserSubscription(value).ok).toBe(false);
  });

  it("rejects a missing endpoint", () => {
    const raw = validRawSubscription() as Record<string, unknown>;
    delete raw.endpoint;
    expect(parseBrowserSubscription(raw).ok).toBe(false);
  });

  it("rejects a non-string endpoint", () => {
    expect(parseBrowserSubscription({ ...validRawSubscription(), endpoint: 12345 }).ok).toBe(false);
  });

  it("rejects a non-URL endpoint", () => {
    expect(parseBrowserSubscription({ ...validRawSubscription(), endpoint: "not a url" }).ok).toBe(false);
  });

  it("rejects a non-https endpoint (e.g. a spoofed http:// or javascript: value)", () => {
    expect(
      parseBrowserSubscription({ ...validRawSubscription(), endpoint: "http://fcm.googleapis.com/fcm/send/x" }).ok,
    ).toBe(false);
    expect(
      parseBrowserSubscription({ ...validRawSubscription(), endpoint: "javascript:alert(1)" }).ok,
    ).toBe(false);
  });

  it("rejects a missing keys object", () => {
    const raw = validRawSubscription() as Record<string, unknown>;
    delete raw.keys;
    expect(parseBrowserSubscription(raw).ok).toBe(false);
  });

  it("rejects a non-object keys value", () => {
    expect(parseBrowserSubscription({ ...validRawSubscription(), keys: "nope" }).ok).toBe(false);
  });

  it("rejects a missing/short p256dh", () => {
    expect(
      parseBrowserSubscription({ ...validRawSubscription(), keys: { p256dh: "short", auth: VALID_AUTH } }).ok,
    ).toBe(false);
    expect(
      parseBrowserSubscription({ ...validRawSubscription(), keys: { auth: VALID_AUTH } }).ok,
    ).toBe(false);
  });

  it("rejects a missing/short auth", () => {
    expect(
      parseBrowserSubscription({ ...validRawSubscription(), keys: { p256dh: VALID_P256DH, auth: "x" } }).ok,
    ).toBe(false);
  });

  it("rejects a p256dh/auth containing non-base64url characters", () => {
    expect(
      parseBrowserSubscription({
        ...validRawSubscription(),
        keys: { p256dh: "not valid base64!! ".repeat(5), auth: VALID_AUTH },
      }).ok,
    ).toBe(false);
  });

  it("rejects an absurdly long key (basic shape sanity, not just a min-length check)", () => {
    expect(
      parseBrowserSubscription({
        ...validRawSubscription(),
        keys: { p256dh: "B".repeat(5000), auth: VALID_AUTH },
      }).ok,
    ).toBe(false);
  });

  it("rejects a non-numeric expirationTime", () => {
    expect(parseBrowserSubscription({ ...validRawSubscription(), expirationTime: "soon" }).ok).toBe(false);
  });

  it("never throws, regardless of how malformed the input is", () => {
    const inputs = [null, undefined, 42, "x", [], {}, { endpoint: {} }, { keys: null }];
    for (const input of inputs) {
      expect(() => parseBrowserSubscription(input)).not.toThrow();
    }
  });
});
