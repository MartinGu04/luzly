import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the security/correctness SHAPE of
 * `supabase/migrations/*_add_aggregate_notification_episode_dedupe.sql` --
 * same scope note as `migration.test.ts`/`reminderJobRevivalMigration.test.ts`:
 * this does NOT execute the migration, so it can't prove the SQL compiles
 * or behaves correctly at runtime. The genuine runtime proof (that an open
 * episode is refreshed in place while a resolved one reopens fresh, under
 * real concurrent connections) lives in
 * `notificationEngineFunctions.integration.test.ts`.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readAggregateEpisodeMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("add_aggregate_notification_episode_dedupe"));
  expect(files.length).toBe(1);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("aggregate notification episode-dedupe migration -- shape (text-level only, see docstring)", () => {
  const sql = readAggregateEpisodeMigration();

  it("adds a nullable resolved_at column to notification_jobs -- never dropping/renaming an existing column", () => {
    expect(sql).toMatch(/alter table notification_jobs\s+add column resolved_at timestamptz/i);
  });

  it("defines upsert_aggregate_notification_job", () => {
    expect(sql).toMatch(/create or replace function public\.upsert_aggregate_notification_job/i);
  });

  it("defines resolve_aggregate_notification_job", () => {
    expect(sql).toMatch(/create or replace function public\.resolve_aggregate_notification_job/i);
  });

  it("upsert_aggregate_notification_job locks the target row with SELECT ... FOR UPDATE before deciding -- a real row lock, never a bare client-side check", () => {
    const fnMatch = sql.match(/create or replace function public\.upsert_aggregate_notification_job[\s\S]*?\$\$;/i);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/for update/i);
  });

  it("upsert_aggregate_notification_job retries on unique_violation instead of failing the caller -- the concurrent-first-insert race is handled, not just documented", () => {
    const fnMatch = sql.match(/create or replace function public\.upsert_aggregate_notification_job[\s\S]*?\$\$;/i);
    expect(fnMatch![0]).toMatch(/exception when unique_violation/i);
  });

  it("upsert_aggregate_notification_job resets status/attempts/claimed_at/resolved_at only when reopening a RESOLVED episode, never when refreshing an open one", () => {
    const fnMatch = sql.match(/create or replace function public\.upsert_aggregate_notification_job[\s\S]*?\$\$;/i);
    const body = fnMatch![0];
    // The "reopen" branch (existing_resolved_at is not null) writes status/attempts/claimed_at.
    const reopenBranch = body.match(/if existing_resolved_at is not null then([\s\S]*?)return true;/i);
    expect(reopenBranch).not.toBeNull();
    expect(reopenBranch![1]).toMatch(/status\s*=\s*'pending'/i);
    expect(reopenBranch![1]).toMatch(/attempts\s*=\s*0/i);
    // The final "still-open episode" update (after BOTH `return true;`
    // branches -- the fresh-insert one and the reopen-a-resolved-row one)
    // never touches status/attempts/claimed_at.
    const refreshBranch = body.slice(body.lastIndexOf("return true;") + "return true;".length);
    expect(refreshBranch).not.toMatch(/\bstatus\s*=/i);
    expect(refreshBranch).not.toMatch(/\battempts\s*=/i);
    expect(refreshBranch).not.toMatch(/\bclaimed_at\s*=/i);
  });

  it("resolve_aggregate_notification_job only touches an OPEN episode (resolved_at is null), never re-resolving/overwriting an already-resolved one", () => {
    const fnMatch = sql.match(/create or replace function public\.resolve_aggregate_notification_job[\s\S]*?\$\$;/i);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/where dedupe_key = p_dedupe_key and resolved_at is null/i);
  });

  it("revokes public/anon/authenticated and grants only service_role for both functions, same posture as every other engine function", () => {
    expect(sql).toMatch(/revoke all on function public\.upsert_aggregate_notification_job[\s\S]*?from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.upsert_aggregate_notification_job[\s\S]*?to service_role/i);
    expect(sql).toMatch(/revoke all on function public\.resolve_aggregate_notification_job[\s\S]*?from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.resolve_aggregate_notification_job[\s\S]*?to service_role/i);
  });

  it("never adds a create policy -- no new RLS surface introduced by this migration", () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it("never drops or alters the existing dedupe_key uniqueness guarantee this whole mechanism relies on", () => {
    expect(sql).not.toMatch(/drop constraint/i);
  });
});
