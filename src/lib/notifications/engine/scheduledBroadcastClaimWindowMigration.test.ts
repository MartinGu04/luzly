import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Text-level regression guard on the security SHAPE of
 * `supabase/migrations/*_speed_up_manager_scheduled_broadcast_claim.sql`
 * -- the minute-level-precision follow-up's own migration, which
 * `create or replace`s `claim_due_manager_scheduled_broadcasts` (shrinking
 * its stale-claim window) and adds `peek_due_manager_scheduled_broadcasts`.
 * Same scope note as `scheduledBroadcastMigration.test.ts`: does NOT
 * execute the migration, so it can't prove the SQL compiles or behaves
 * correctly at runtime (see `notificationEngineFunctions.integration.test.ts`
 * for that).
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function readClaimWindowMigration(): string {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.includes("speed_up_manager_scheduled_broadcast_claim"));
  expect(files.length).toBe(1);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

function readOriginalScheduledBroadcastMigration(): string {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.includes("create_manager_scheduled_broadcasts"));
  expect(files.length).toBe(1);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("manager scheduled broadcast claim-window migration -- security shape (text-level only, see docstring)", () => {
  const sql = readClaimWindowMigration();

  it("this file never edits the already-deployed create_manager_scheduled_broadcasts migration", () => {
    const originalFile = fs
      .readdirSync(MIGRATIONS_DIR)
      .find((name) => name.includes("create_manager_scheduled_broadcasts"))!;
    const originalSql = fs.readFileSync(path.join(MIGRATIONS_DIR, originalFile), "utf8");
    expect(originalSql).toMatch(/status = 'claimed' and batch_id is null and claimed_at < now\(\) - interval '4 minutes'/i);
  });

  it("sorts after the already-deployed 20260821090000 migration", () => {
    const claimWindowFile = fs
      .readdirSync(MIGRATIONS_DIR)
      .find((name) => name.includes("speed_up_manager_scheduled_broadcast_claim"))!;
    expect(claimWindowFile > "20260821090000").toBe(true);
  });

  it("only ever `create or replace function`s -- never a table/column/constraint change", () => {
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/alter table/i);
    expect(sql).not.toMatch(/create index/i);
  });

  it("shrinks the stale-claim lease from 4 minutes to 90 seconds", () => {
    expect(sql).not.toMatch(/interval '4 minutes'/i);
    expect(sql).toMatch(/status = 'claimed' and claimed_at < now\(\) - interval '90 seconds'/i);
  });

  it("CRITICAL: batch_id is NEVER part of the eligibility condition -- a fresh 'claimed' row with a checkpointed batch_id is NOT immediately reclaimable, only a lease-expired one is (the bug this migration was rewritten to fix)", () => {
    // Strip `--` line comments first -- the doc comment above legitimately
    // discusses `batch_id is not null` as the BUG being fixed, so a raw
    // scan of the whole file text would false-positive on that prose.
    // Only the actual SQL matters here.
    const sqlOnly = sql
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");

    expect(sqlOnly).not.toMatch(/batch_id is not null/i);
    expect(sqlOnly).not.toMatch(/batch_id is null and claimed_at/i);

    // Every 'claimed' eligibility branch (a WHERE/OR clause -- always
    // "status = 'claimed' and ...)", never the UPDATE's own unrelated
    // "set status = 'claimed', claimed_at = now()" SET clause) must be
    // the SAME uniform claimed_at-vs-lease check, never gated on batch_id.
    const claimedBranches = sqlOnly.match(/status = 'claimed' and [^\n]*/gi) ?? [];
    expect(claimedBranches.length).toBeGreaterThan(0);
    for (const branch of claimedBranches) {
      expect(branch).not.toMatch(/batch_id/i);
      expect(branch).toMatch(/claimed_at < now\(\) - interval '90 seconds'/i);
    }
  });

  it("the claim function still never resets a claimed row back to 'scheduled'", () => {
    expect(sql).not.toMatch(/set status = 'scheduled', claimed_at = null/i);
  });

  it("the claim function still uses for update skip locked", () => {
    expect(sql).toMatch(/claim_due_manager_scheduled_broadcasts[\s\S]*?for update skip locked/i);
  });

  it("re-declares claim_due_manager_scheduled_broadcasts as service_role-only", () => {
    expect(sql).toMatch(/create or replace function public\.claim_due_manager_scheduled_broadcasts/i);
    expect(sql).toMatch(
      /revoke all on function public\.claim_due_manager_scheduled_broadcasts\(integer\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(/grant execute on function public\.claim_due_manager_scheduled_broadcasts\(integer\) to service_role/i);
  });

  it("declares peek_due_manager_scheduled_broadcasts as a read-only, service_role-only function", () => {
    expect(sql).toMatch(/create or replace function public\.peek_due_manager_scheduled_broadcasts\(\)/i);
    expect(sql).toMatch(
      /revoke all on function public\.peek_due_manager_scheduled_broadcasts\(\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(/grant execute on function public\.peek_due_manager_scheduled_broadcasts\(\) to service_role/i);
  });

  it("the peek function mirrors the exact same two-way, lease-only eligibility condition as the claim function -- never allowed to drift", () => {
    const claimMatch = sql.match(/claim_due_manager_scheduled_broadcasts[\s\S]*?\$\$;/i)?.[0] ?? "";
    const peekMatch = sql.match(/peek_due_manager_scheduled_broadcasts[\s\S]*?\$\$;/i)?.[0] ?? "";
    for (const clause of [
      "status = 'scheduled' and scheduled_for <= now\\(\\)",
      "status = 'claimed' and claimed_at < now\\(\\) - interval '90 seconds'",
    ]) {
      expect(claimMatch).toMatch(new RegExp(clause, "i"));
      expect(peekMatch).toMatch(new RegExp(clause, "i"));
    }
  });

  it("the peek function never mutates -- no update/insert/delete", () => {
    const peekMatch = sql.match(/create or replace function public\.peek_due_manager_scheduled_broadcasts[\s\S]*?\$\$;/i)?.[0] ?? "";
    expect(peekMatch).not.toMatch(/\bupdate\b/i);
    expect(peekMatch).not.toMatch(/\binsert\b/i);
    expect(peekMatch).not.toMatch(/\bdelete\b/i);
  });
});

describe("original create_manager_scheduled_broadcasts migration is untouched by this follow-up", () => {
  it("still contains its own original 4-minute window text (this file only ever replaces the function in a NEW migration, never edits the old file)", () => {
    const sql = readOriginalScheduledBroadcastMigration();
    expect(sql).toMatch(/interval '4 minutes'/i);
  });
});
