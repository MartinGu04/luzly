import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the security SHAPE of
 * `supabase/migrations/*_create_manager_notification_batches.sql` -- same
 * scope note as `inboxMigration.test.ts`: this does NOT execute the
 * migration, so it can't prove the SQL compiles or behaves correctly at
 * runtime.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readManualBroadcastMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("manager_notification_batches"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("manager_notification_batches migration -- security shape (text-level only, see docstring)", () => {
  const sql = readManualBroadcastMigration();

  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.manager_notification_batches enable row level security/i);
  });

  it("declares zero RLS policies -- default-deny for anon/authenticated, same posture as every other notification_* table", () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it("never alters notification_jobs or notification_deliveries -- an audit/idempotency table only, never a second delivery engine", () => {
    expect(sql).not.toMatch(/alter table public\.notification_jobs/i);
    expect(sql).not.toMatch(/alter table public\.notification_deliveries/i);
  });

  it("the idempotency key is unique -- the batch-level double-submission guard", () => {
    expect(sql).toMatch(/unique \(idempotency_key\)/i);
  });

  it("constrains audience_kind to the three known values", () => {
    expect(sql).toMatch(/check \(audience_kind in \('person', 'people', 'everyone'\)\)/i);
  });

  it("carries no recipient PII columns -- only the SENDING manager's own id/name (comment prose may mention 'recipient'/'email' in passing, but never as a real column/constraint definition)", () => {
    expect(sql).not.toMatch(/^\s*recipient_\w+\s/im);
    expect(sql).not.toMatch(/^\s*\w*email\w*\s+text/im);
  });
});
