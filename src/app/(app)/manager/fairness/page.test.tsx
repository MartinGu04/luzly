import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({ redirect }));

const { default: ManagerFairnessRedirectPage } = await import("./page");

describe("/manager/fairness — PR #4 backward-compatibility redirect", () => {
  it("redirects to the standalone Fairness experience in Duty mode, never a 404", () => {
    expect(() => ManagerFairnessRedirectPage()).toThrow("REDIRECT:/fairness?mode=duties");
    expect(redirect).toHaveBeenCalledWith("/fairness?mode=duties");
  });
});
