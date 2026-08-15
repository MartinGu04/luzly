import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the security SHAPE of
 * `supabase/migrations/*_create_notification_engine.sql` -- mirrors
 * `src/lib/push/migration.test.ts`'s own scope note: this does NOT
 * execute the migration, so it can't prove the SQL compiles or behaves
 * correctly at runtime. A genuine runtime proof of the three functions'
 * atomicity/concurrency guarantees lives in
 * `notificationEngineFunctions.integration.test.ts`.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readNotificationEngineMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("notification_engine"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("notification engine migration -- security shape (text-level only, see docstring)", () => {
  const sql = readNotificationEngineMigration();

  const TABLES = [
    "notification_baseline_state",
    "observed_notification_facts",
    "pending_notification_changes",
    "notification_jobs",
    "notification_deliveries",
  ];

  it("enables row level security on every engine table", () => {
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    }
  });

  it("declares zero RLS policies -- default-deny for anon/authenticated on every engine table", () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it("every engine function explicitly revokes public/anon/authenticated and grants only to service_role", () => {
    const FUNCTIONS = [
      "advance_notification_baseline\\(date\\)",
      "claim_due_pending_notification_changes\\(integer\\)",
      "claim_due_notification_jobs\\(integer\\)",
    ];
    for (const fn of FUNCTIONS) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*?from public, anon, authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to service_role`, "i"));
    }
  });

  it("notification_jobs enforces dedupe_key uniqueness -- the sole idempotency guarantee for job creation", () => {
    expect(sql).toMatch(/notification_jobs_dedupe_key_unique unique \(dedupe_key\)/i);
  });

  it("notification_deliveries enforces one row per (job, subscription) -- multi-device fan-out without duplicates", () => {
    expect(sql).toMatch(/notification_deliveries_unique unique \(job_id, push_subscription_id\)/i);
  });

  it("notification_jobs.recipient_user_id cascades on auth user deletion", () => {
    expect(sql).toMatch(/recipient_user_id uuid not null references auth\.users \(id\) on delete cascade/i);
  });

  it("notification_deliveries cascades on job and push_subscription deletion", () => {
    expect(sql).toMatch(/job_id uuid not null references public\.notification_jobs \(id\) on delete cascade/i);
    expect(sql).toMatch(
      /push_subscription_id uuid not null references public\.push_subscriptions \(id\) on delete cascade/i,
    );
  });

  it("both claim functions use 'for update skip locked' -- concurrent workers can never claim the same row", () => {
    expect(sql).toMatch(/claim_due_pending_notification_changes[\s\S]*?for update skip locked/i);
    expect(sql).toMatch(/claim_due_notification_jobs[\s\S]*?for update skip locked/i);
  });

  it("both claim functions reclaim stale 'claimed' rows rather than losing them forever", () => {
    const reclaimBlocks = sql.match(/set status = 'pending'[\s\S]{0,80}where status = 'claimed'/gi) ?? [];
    expect(reclaimBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it("advance_notification_baseline locks the singleton row (for update) before deciding -- serializes concurrent workers", () => {
    expect(sql).toMatch(/select \* into current_row from public\.notification_baseline_state where id = 1 for update/i);
  });

  it("the baseline table is a true singleton (id check constraint)", () => {
    expect(sql).toMatch(/notification_baseline_state_singleton check \(id = 1\)/i);
  });

  it("documents why service_role is used here, unlike PR #29's push_subscriptions migration", () => {
    expect(sql).toMatch(/SERVICE ROLE, deliberately/i);
  });

  it("never dumps a raw workbook cell -- only small normalized jsonb facts", () => {
    expect(sql).not.toMatch(/raw_value/i);
    expect(sql).not.toMatch(/source_cell/i);
  });
});
