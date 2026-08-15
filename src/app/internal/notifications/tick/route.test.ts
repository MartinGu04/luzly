import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORIGINAL_SECRET = process.env.NOTIFICATION_WORKER_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.NOTIFICATION_WORKER_SECRET;
  else process.env.NOTIFICATION_WORKER_SECRET = ORIGINAL_SECRET;
  vi.clearAllMocks();
  vi.resetModules();
});

const runNotificationWorkerTick = vi.fn();

async function loadRoute() {
  vi.doMock("@/lib/notifications/engine/pipeline", () => ({ runNotificationWorkerTick }));
  return import("./route");
}

function request(url: string, authorization?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return new NextRequest(new URL(url, "https://example.com"), { method: "POST", headers });
}

describe("POST /internal/notifications/tick -- worker authentication", () => {
  it("rejects a request with no Authorization header before doing any work", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    const { POST } = await loadRoute();

    const response = await POST(request("/internal/notifications/tick"));

    expect(response.status).toBe(401);
    expect(runNotificationWorkerTick).not.toHaveBeenCalled();
  });

  it("rejects the wrong secret before doing any work", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    const { POST } = await loadRoute();

    const response = await POST(request("/internal/notifications/tick", "Bearer wrong-secret"));

    expect(response.status).toBe(401);
    expect(runNotificationWorkerTick).not.toHaveBeenCalled();
  });

  it("accepts the correct secret and defaults to dry_run mode when no mode is specified", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    runNotificationWorkerTick.mockResolvedValue({ status: "ok", summary: { mode: "dry_run" } });
    const { POST } = await loadRoute();

    const response = await POST(request("/internal/notifications/tick", "Bearer correct-secret"));

    expect(response.status).toBe(200);
    expect(runNotificationWorkerTick).toHaveBeenCalledWith("dry_run");
  });

  it("only runs a real send when the secret is correct AND mode=send is explicit", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    runNotificationWorkerTick.mockResolvedValue({ status: "ok", summary: { mode: "send" } });
    const { POST } = await loadRoute();

    const response = await POST(request("/internal/notifications/tick?mode=send", "Bearer correct-secret"));

    expect(response.status).toBe(200);
    expect(runNotificationWorkerTick).toHaveBeenCalledWith("send");
  });

  it("an unrecognized mode value falls back to the safe dry_run default rather than sending", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    runNotificationWorkerTick.mockResolvedValue({ status: "ok", summary: { mode: "dry_run" } });
    const { POST } = await loadRoute();

    await POST(request("/internal/notifications/tick?mode=yes-please", "Bearer correct-secret"));

    expect(runNotificationWorkerTick).toHaveBeenCalledWith("dry_run");
  });

  it("never leaks internal error details in the response body", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    runNotificationWorkerTick.mockRejectedValue(new Error("some internal detail with a stack trace"));
    const { POST } = await loadRoute();

    const response = await POST(request("/internal/notifications/tick", "Bearer correct-secret"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("stack trace");
  });
});
