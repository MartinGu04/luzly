import { describe, expect, it } from "vitest";
import {
  formatWorkerErrorLog,
  runStage,
  sanitizeWorkerError,
  WorkerStageError,
} from "./workerErrors";

class SupabaseServiceRoleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseServiceRoleConfigError";
  }
}
class GoogleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleConfigError";
  }
}

describe("runStage / WorkerStageError", () => {
  it("tags a thrown error with the stage it failed in", async () => {
    await expect(
      runStage("recipient_resolution", async () => {
        throw new Error("boom");
      }),
    ).rejects.toMatchObject({ stage: "recipient_resolution" });
  });

  it("passes through a successful result untouched", async () => {
    const result = await runStage("fresh_workbook_read", async () => 42);
    expect(result).toBe(42);
  });

  it("never double-wraps an already-tagged WorkerStageError", async () => {
    await expect(
      runStage("delivery", async () => {
        throw new WorkerStageError("reminders", new Error("inner"));
      }),
    ).rejects.toMatchObject({ stage: "reminders" }); // the ORIGINAL stage, not "delivery"
  });
});

describe("sanitizeWorkerError", () => {
  it("a known config-error class's message is safe to surface verbatim (it only ever names an env var)", () => {
    const error = new SupabaseServiceRoleConfigError("Missing Supabase configuration: SUPABASE_SERVICE_ROLE_KEY.");
    const sanitized = sanitizeWorkerError(error);

    expect(sanitized.name).toBe("SupabaseServiceRoleConfigError");
    expect(sanitized.category).toBe("missing_service_role_key");
    expect(sanitized.detail).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("classifies a Google Sheets config error distinctly", () => {
    const error = new GoogleConfigError("Missing Google service account configuration: GOOGLE_PRIVATE_KEY.");
    const sanitized = sanitizeWorkerError(error);
    expect(sanitized.category).toBe("google_sheet_config_error");
  });

  it("classifies a missing-table Postgres error (migration not applied)", () => {
    const error = { name: "PostgrestError", code: "42P01", message: 'relation "public.notification_jobs" does not exist', hint: null };
    const sanitized = sanitizeWorkerError(error);
    expect(sanitized.category).toBe("migration_table_missing");
    expect(sanitized.code).toBe("42P01");
  });

  it("classifies a missing-function Postgres error (RPC missing)", () => {
    const error = { name: "PostgrestError", code: "42883", message: "function advance_notification_baseline(date) does not exist" };
    const sanitized = sanitizeWorkerError(error);
    expect(sanitized.category).toBe("migration_function_missing");
  });

  it("classifies a Supabase Admin API (auth) failure", () => {
    const error = { name: "AuthApiError", status: 500, message: "unexpected_failure" };
    const sanitized = sanitizeWorkerError(error);
    expect(sanitized.category).toBe("supabase_admin_api_error");
  });

  it("redacts an email address embedded in a message", () => {
    const error = new Error("upsert failed for person alice@example.com");
    const sanitized = sanitizeWorkerError(error);
    expect(sanitized.detail).not.toContain("alice@example.com");
    expect(sanitized.detail).toContain("[email]");
  });

  it("redacts a URL embedded in a message", () => {
    const error = new Error("fetch failed: https://example.supabase.co/rest/v1/notification_jobs?select=*");
    const sanitized = sanitizeWorkerError(error);
    expect(sanitized.detail).not.toContain("supabase.co");
    expect(sanitized.detail).toContain("[url]");
  });

  it("redacts a long opaque token/key/endpoint-shaped string", () => {
    const error = new Error("push send failed for token AbCdEf1234567890AbCdEf1234567890ZzYy");
    const sanitized = sanitizeWorkerError(error);
    expect(sanitized.detail).not.toContain("AbCdEf1234567890AbCdEf1234567890ZzYy");
    expect(sanitized.detail).toContain("[redacted]");
  });

  it("caps an overly long detail message", () => {
    const error = new Error("x".repeat(1000));
    const sanitized = sanitizeWorkerError(error);
    expect(sanitized.detail!.length).toBeLessThanOrEqual(201);
  });

  it("never throws on a non-Error, non-object thrown value", () => {
    expect(() => sanitizeWorkerError("a plain string throw")).not.toThrow();
    expect(() => sanitizeWorkerError(undefined)).not.toThrow();
    expect(() => sanitizeWorkerError(null)).not.toThrow();
    const sanitized = sanitizeWorkerError(null);
    expect(sanitized.name).toBe("UnknownError");
  });
});

describe("formatWorkerErrorLog", () => {
  it("includes the stage, error name, and category on one line", () => {
    const line = formatWorkerErrorLog("recipient_resolution", {
      name: "SupabaseServiceRoleConfigError",
      category: "missing_service_role_key",
    });
    expect(line).toContain("stage=recipient_resolution");
    expect(line).toContain("error=SupabaseServiceRoleConfigError");
    expect(line).toContain("category=missing_service_role_key");
  });

  it("never includes secret-shaped values even if accidentally passed as detail (redaction already applied upstream by sanitizeWorkerError, but the formatter itself does not re-introduce anything)", () => {
    const line = formatWorkerErrorLog("delivery", {
      name: "Error",
      category: "unknown",
      detail: "[redacted]",
    });
    expect(line).not.toMatch(/[A-Za-z0-9_-]{40,}/); // no long opaque strings anywhere in the final line
  });
});
