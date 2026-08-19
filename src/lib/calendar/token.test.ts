import { describe, expect, it } from "vitest";
import { generateCalendarFeedToken } from "./token";

describe("generateCalendarFeedToken", () => {
  it("produces a URL-safe base64url string (no +, /, or = padding)", () => {
    const token = generateCalendarFeedToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("encodes 256 bits (32 random bytes) -- 43 base64url characters, no padding", () => {
    const token = generateCalendarFeedToken();
    expect(token.length).toBe(43);
  });

  it("is unguessable in practice: two consecutive calls never collide", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateCalendarFeedToken());
    }
    expect(seen.size).toBe(1000);
  });
});
