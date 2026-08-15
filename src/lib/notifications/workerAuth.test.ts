import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_SECRET = process.env.NOTIFICATION_WORKER_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.NOTIFICATION_WORKER_SECRET;
  else process.env.NOTIFICATION_WORKER_SECRET = ORIGINAL_SECRET;
  vi.resetModules();
});

async function importFresh() {
  vi.resetModules();
  return import("./workerAuth");
}

describe("isAuthorizedWorkerRequest", () => {
  it("rejects a missing Authorization header", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    const { isAuthorizedWorkerRequest } = await importFresh();
    expect(isAuthorizedWorkerRequest(null)).toBe(false);
  });

  it("rejects a header that isn't the Bearer scheme", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    const { isAuthorizedWorkerRequest } = await importFresh();
    expect(isAuthorizedWorkerRequest("Basic correct-secret")).toBe(false);
  });

  it("rejects the wrong secret", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    const { isAuthorizedWorkerRequest } = await importFresh();
    expect(isAuthorizedWorkerRequest("Bearer wrong-secret")).toBe(false);
  });

  it("rejects a secret that is a prefix or suffix of the real one (length mismatch)", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    const { isAuthorizedWorkerRequest } = await importFresh();
    expect(isAuthorizedWorkerRequest("Bearer correct-secre")).toBe(false);
    expect(isAuthorizedWorkerRequest("Bearer correct-secretx")).toBe(false);
  });

  it("accepts the correct secret", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "correct-secret";
    const { isAuthorizedWorkerRequest } = await importFresh();
    expect(isAuthorizedWorkerRequest("Bearer correct-secret")).toBe(true);
  });

  it("fails closed when the server secret itself is not configured -- never treats an unconfigured server as 'anything goes'", async () => {
    delete process.env.NOTIFICATION_WORKER_SECRET;
    const { isAuthorizedWorkerRequest } = await importFresh();
    expect(isAuthorizedWorkerRequest("Bearer anything")).toBe(false);
  });

  it("fails closed when the server secret is an empty string", async () => {
    process.env.NOTIFICATION_WORKER_SECRET = "";
    const { isAuthorizedWorkerRequest } = await importFresh();
    expect(isAuthorizedWorkerRequest("Bearer ")).toBe(false);
  });
});
