import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "./safeRedirect";

describe("sanitizeNextPath", () => {
  it("accepts a normal internal path", () => {
    expect(sanitizeNextPath("/schedule")).toBe("/schedule");
  });

  it('defaults to "/" for null/undefined/empty', () => {
    expect(sanitizeNextPath(null)).toBe("/");
    expect(sanitizeNextPath(undefined)).toBe("/");
    expect(sanitizeNextPath("")).toBe("/");
  });

  it("14. rejects an absolute external URL", () => {
    expect(sanitizeNextPath("https://evil.example")).toBe("/");
    expect(sanitizeNextPath("http://evil.example/phish")).toBe("/");
  });

  it("rejects a protocol-relative //host redirect trick", () => {
    expect(sanitizeNextPath("//evil.example")).toBe("/");
  });

  it("rejects a path not starting with a slash", () => {
    expect(sanitizeNextPath("evil.example")).toBe("/");
  });

  it("rejects an embedded scheme anywhere in the value", () => {
    expect(sanitizeNextPath("/redirect?to=javascript://alert(1)")).toBe("/");
  });

  it("rejects a backslash-based trick", () => {
    expect(sanitizeNextPath("/\\evil.example")).toBe("/");
  });

  it("accepts a path with query params/fragments as long as it stays internal", () => {
    expect(sanitizeNextPath("/schedule?week=5")).toBe("/schedule?week=5");
  });
});
