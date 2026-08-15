import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./base64url";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("urlBase64ToUint8Array", () => {
  it("round-trips arbitrary bytes through base64url encoding", () => {
    const original = new Uint8Array([0, 1, 2, 254, 255, 128, 42, 7]);
    const encoded = toBase64Url(original);
    expect(urlBase64ToUint8Array(encoded)).toEqual(original);
  });

  it("handles a real-shaped 65-byte VAPID public key length", () => {
    const original = new Uint8Array(65).map((_, i) => i * 3);
    const encoded = toBase64Url(original);
    const decoded = urlBase64ToUint8Array(encoded);
    expect(decoded).toHaveLength(65);
    expect(decoded).toEqual(original);
  });

  it("correctly converts '-' and '_' back to standard base64 characters", () => {
    // Bytes chosen so the base64url encoding actually contains '-'/'_'.
    const original = new Uint8Array([251, 255, 191]);
    const encoded = toBase64Url(original);
    expect(encoded).toMatch(/[-_]/);
    expect(urlBase64ToUint8Array(encoded)).toEqual(original);
  });

  it("handles every padding-length case (0/1/2/3 chars of missing '=')", () => {
    for (let length = 1; length <= 8; length++) {
      const original = new Uint8Array(length).map((_, i) => (i + 1) * 11);
      const encoded = toBase64Url(original);
      expect(urlBase64ToUint8Array(encoded)).toEqual(original);
    }
  });
});
