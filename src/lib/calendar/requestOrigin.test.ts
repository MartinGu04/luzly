import { describe, expect, it, vi } from "vitest";

const headersMock = vi.fn();
vi.mock("next/headers", () => ({ headers: () => headersMock() }));

const { resolveRequestOrigin } = await import("./requestOrigin");

function headerList(values: Record<string, string>) {
  return { get: (key: string) => values[key] ?? null };
}

describe("resolveRequestOrigin", () => {
  it("reads host/x-forwarded-host/x-forwarded-proto from next/headers and delegates to resolveOriginFromHeaders", async () => {
    headersMock.mockResolvedValue(
      headerList({ host: "internal:3000", "x-forwarded-host": "mi-ma-mo.app", "x-forwarded-proto": "https" }),
    );

    expect(await resolveRequestOrigin()).toBe("https://mi-ma-mo.app");
  });

  it("returns null when no host header is present at all", async () => {
    headersMock.mockResolvedValue(headerList({}));
    expect(await resolveRequestOrigin()).toBeNull();
  });
});
