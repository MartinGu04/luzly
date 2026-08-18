import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the security SHAPE of
 * `supabase/migrations/*_create_notification_inbox_state.sql` -- same
 * scope note as `migration.test.ts`: this does NOT execute the
 * migration, so it can't prove the SQL compiles or behaves correctly at
 * runtime.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readInboxStateMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("notification_inbox_state"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("notification inbox state migration -- security shape (text-level only, see docstring)", () => {
  const sql = readInboxStateMigration();

  const TABLES = ["notification_reads", "notification_inbox_state"];

  it("enables row level security on both new tables", () => {
    for (const table of TABLES) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    }
  });

  it("declares zero RLS policies -- default-deny for anon/authenticated, same posture as every other notification_* table", () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it("never adds a column to notification_jobs -- the inbox is a projection, never a mutation of the outbox", () => {
    expect(sql).not.toMatch(/alter table public\.notification_jobs/i);
  });

  it("notification_reads is keyed per (user, job) -- never a coarse single cursor", () => {
    expect(sql).toMatch(/primary key \(user_id, job_id\)/i);
  });

  it("notification_reads cascades on job and user deletion", () => {
    expect(sql).toMatch(/user_id uuid not null references auth\.users \(id\) on delete cascade/i);
    expect(sql).toMatch(/job_id uuid not null references public\.notification_jobs \(id\) on delete cascade/i);
  });

  it("notification_inbox_state is a per-user singleton (user_id itself is the primary key)", () => {
    expect(sql).toMatch(/user_id uuid primary key references auth\.users \(id\) on delete cascade/i);
  });

  it("clear-inbox state is a single cutoff timestamp, never a per-job delete/dismiss list", () => {
    expect(sql).toMatch(/cleared_before timestamptz not null default '-infinity'/i);
  });

  it("documents the service-role posture and why it never mutates notification_jobs", () => {
    expect(sql).toMatch(/SERVICE ROLE, deliberately/i);
    expect(sql).toMatch(/never mutates notification_jobs/i);
  });
});
