import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the security/correctness SHAPE of
 * `supabase/migrations/*_fix_reminder_job_revival.sql` -- same scope note
 * as `migration.test.ts`: this does NOT execute the migration, so it
 * can't prove the SQL compiles or behaves correctly at runtime. The
 * genuine runtime proof (that a terminal job survives a later upsert
 * untouched) lives in `notificationEngineFunctions.integration.test.ts`.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readRevivalFixMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("fix_reminder_job_revival"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("reminder job revival hotfix migration -- shape (text-level only, see docstring)", () => {
  const sql = readRevivalFixMigration();

  it("defines upsert_pending_reminder_job", () => {
    expect(sql).toMatch(/create or replace function public\.upsert_pending_reminder_job/i);
  });

  it("uses a real ON CONFLICT ... DO UPDATE ... WHERE guard, never relying on a client-side filter", () => {
    expect(sql).toMatch(/on conflict \(dedupe_key\) do update set[\s\S]*?where public\.notification_jobs\.status = 'pending'/i);
  });

  it("never sets status in the DO UPDATE SET list -- the WHERE guard already proves it's 'pending' whenever the update fires", () => {
    const setClauseMatch = sql.match(/do update set([\s\S]*?)where public\.notification_jobs\.status = 'pending'/i);
    expect(setClauseMatch).not.toBeNull();
    expect(setClauseMatch![1]).not.toMatch(/\bstatus\s*=/i);
  });

  it("never touches attempts, claimed_at, or max_attempts -- job-level retry bookkeeping stays owned by claim_due_notification_jobs alone", () => {
    const setClauseMatch = sql.match(/do update set([\s\S]*?)where public\.notification_jobs\.status = 'pending'/i);
    expect(setClauseMatch![1]).not.toMatch(/\battempts\s*=/i);
    expect(setClauseMatch![1]).not.toMatch(/\bclaimed_at\s*=/i);
    expect(setClauseMatch![1]).not.toMatch(/\bmax_attempts\s*=/i);
  });

  it("revokes public/anon/authenticated and grants only service_role, same posture as every other engine function", () => {
    expect(sql).toMatch(/revoke all on function public\.upsert_pending_reminder_job[\s\S]*?from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.upsert_pending_reminder_job[\s\S]*?to service_role/i);
  });

  it("documents the proven root cause (Production incident, PostgREST upsert filter limitation)", () => {
    expect(sql).toMatch(/production/i);
    expect(sql).toMatch(/postgrest/i);
  });

  it("never adds a create policy -- no new RLS surface introduced by this hotfix", () => {
    expect(sql).not.toMatch(/create policy/i);
  });
});
