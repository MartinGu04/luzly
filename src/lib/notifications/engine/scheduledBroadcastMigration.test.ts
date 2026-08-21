import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the security SHAPE of
 * `supabase/migrations/*_create_manager_scheduled_broadcasts.sql` -- same
 * scope note as `manualBroadcastMigration.test.ts`: this does NOT execute
 * the migration, so it can't prove the SQL compiles or behaves correctly
 * at runtime (see `notificationEngineFunctions.integration.test.ts` for
 * that).
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readScheduledBroadcastMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("manager_scheduled_broadcasts"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

function readManagerNotificationBatchesMigration(): string {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.includes("manager_notification_batches"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("manager_scheduled_broadcasts migration -- security shape (text-level only, see docstring)", () => {
  const sql = readScheduledBroadcastMigration();

  it("enables row level security", () => {
    expect(sql).toMatch(/alter table public\.manager_scheduled_broadcasts enable row level security/i);
  });

  it("declares zero RLS policies -- default-deny for anon/authenticated, same posture as every other notification_* table", () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it("constrains status to the four known lifecycle values", () => {
    expect(sql).toMatch(/check \(status in \('scheduled', 'claimed', 'dispatched', 'cancelled'\)\)/i);
  });

  it("constrains audience_kind to the three known values, same as manager_notification_batches", () => {
    expect(sql).toMatch(/check \(audience_kind in \('person', 'people', 'everyone'\)\)/i);
  });

  it("references manager_notification_batches by id -- the dispatch checkpoint, never a duplicated batch schema", () => {
    expect(sql).toMatch(/batch_id uuid references public\.manager_notification_batches \(id\)/i);
  });

  it("never alters notification_jobs, notification_deliveries, or manager_notification_batches -- a separate mutable pre-dispatch table only, never a second delivery engine", () => {
    expect(sql).not.toMatch(/alter table public\.notification_jobs/i);
    expect(sql).not.toMatch(/alter table public\.notification_deliveries/i);
    expect(sql).not.toMatch(/alter table public\.manager_notification_batches/i);
  });

  it("the worker's bulk claim function uses for update skip locked -- the concurrency-safety property this whole feature depends on", () => {
    expect(sql).toMatch(/for update skip locked/i);
  });

  it("a stale 'claimed' row with no batch_id is NEVER reset back to 'scheduled' -- 'claimed' is an irreversible boundary (a batch may already exist externally by then)", () => {
    expect(sql).not.toMatch(/set status = 'scheduled', claimed_at = null/i);
    // The stale-claim case is folded into the SAME eligibility clause as
    // the other two claimable cases, all resolving to `status = 'claimed'`.
    expect(sql).toMatch(/status = 'claimed' and batch_id is null and claimed_at < now\(\) - interval '4 minutes'/i);
  });

  it("declares claim_due_manager_scheduled_broadcasts and claim_manager_scheduled_broadcast_now, both service_role-only", () => {
    expect(sql).toMatch(/create or replace function public\.claim_due_manager_scheduled_broadcasts/i);
    expect(sql).toMatch(/create or replace function public\.claim_manager_scheduled_broadcast_now/i);
    expect(sql).toMatch(
      /revoke all on function public\.claim_due_manager_scheduled_broadcasts\(integer\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(/grant execute on function public\.claim_due_manager_scheduled_broadcasts\(integer\) to service_role/i);
    expect(sql).toMatch(
      /revoke all on function public\.claim_manager_scheduled_broadcast_now\(uuid, text, text\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.claim_manager_scheduled_broadcast_now\(uuid, text, text\) to service_role/i,
    );
  });

  it("claim_manager_scheduled_broadcast_now records the send-now actor's identity atomically with the winning claim, never the client-supplied recipient/roster data", () => {
    expect(sql).toMatch(/sent_now_by_person_id text/i);
    expect(sql).toMatch(/sent_now_by_person_name text/i);
    expect(sql).toMatch(/sent_now_at timestamptz/i);
    expect(sql).toMatch(/sent_now_by_person_id\s*=\s*p_sent_now_by_person_id/i);
    expect(sql).toMatch(/sent_now_by_person_name\s*=\s*p_sent_now_by_person_name/i);
  });

  it("carries no recipient PII columns -- only manager audit ids/names, exactly like manager_notification_batches", () => {
    expect(sql).not.toMatch(/^\s*recipient_\w+\s/im);
    expect(sql).not.toMatch(/^\s*\w*email\w*\s+text/im);
  });
});

describe("this migration file never edits PR #78's already-deployed manager_notification_batches migration", () => {
  it("the manager_notification_batches migration still only ever CREATEs the table -- no ADD COLUMN/ALTER TABLE ... ADD/DROP was appended to the already-deployed file", () => {
    const sql = readManagerNotificationBatchesMigration();
    expect(sql).toMatch(/create table if not exists public\.manager_notification_batches/i);
    expect(sql).not.toMatch(/alter table public\.manager_notification_batches\s+(add|drop|alter)/i);
  });

  it("scheduling lives in its OWN, separate, later-timestamped migration file", () => {
    const scheduledFile = fs.readdirSync(MIGRATIONS_DIR).find((name) => name.includes("manager_scheduled_broadcasts"));
    const batchesFile = fs.readdirSync(MIGRATIONS_DIR).find((name) => name.includes("manager_notification_batches"));
    expect(scheduledFile).toBeDefined();
    expect(batchesFile).toBeDefined();
    expect(scheduledFile).not.toBe(batchesFile);
    // Migration filenames are sortable timestamps -- the new file must sort AFTER the deployed one.
    expect(scheduledFile! > batchesFile!).toBe(true);
  });
});
