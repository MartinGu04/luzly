import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { PushEndpointHiddenField } from "./PushEndpointHiddenField";

const getCurrentPushEndpoint = vi.fn();
vi.mock("@/lib/push/browserSubscription", () => ({
  getCurrentPushEndpoint: () => getCurrentPushEndpoint(),
}));

afterEach(() => {
  cleanup();
  getCurrentPushEndpoint.mockReset();
});

describe("PushEndpointHiddenField", () => {
  it("starts empty, then fills in once the endpoint resolves", async () => {
    getCurrentPushEndpoint.mockResolvedValue("https://push.example/e1");
    const { container } = render(<PushEndpointHiddenField />);

    const input = container.querySelector('input[name="pushEndpoint"]') as HTMLInputElement;
    expect(input).toHaveAttribute("type", "hidden");

    await act(async () => {});
    expect(input.value).toBe("https://push.example/e1");
  });

  it("stays empty when there is no current subscription", async () => {
    getCurrentPushEndpoint.mockResolvedValue(null);
    const { container } = render(<PushEndpointHiddenField />);
    await act(async () => {});

    const input = container.querySelector('input[name="pushEndpoint"]') as HTMLInputElement;
    expect(input.value).toBe("");
  });
});
