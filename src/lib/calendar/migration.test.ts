import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A text-level regression guard on the security-critical SHAPE of
 * `supabase/migrations/*_calendar_feeds.sql` -- same convention/scope as
 * `lib/push/migration.test.ts` (inspects the SQL text; does not execute
 * it against a real PostgreSQL, so it can't prove the SQL actually
 * compiles/behaves correctly at runtime).
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "supabase", "migrations");

function readCalendarFeedsMigration(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.includes("calendar_feeds"));
  expect(files.length).toBeGreaterThan(0);
  return fs.readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

describe("calendar_feeds migration -- security shape (text-level only, see docstring)", () => {
  const sql = readCalendarFeedsMigration();

  it("enables row level security on the table", () => {
    expect(sql).toMatch(/alter table public\.calendar_feeds enable row level security/i);
  });

  it("declares both user_id and token as unique -- one feed per user, and a token can never resolve to more than one owner", () => {
    expect(sql).toMatch(/user_id uuid not null unique references auth\.users/i);
    expect(sql).toMatch(/token text not null unique/i);
  });

  it("cascades deletion when the owning auth user is deleted", () => {
    expect(sql).toMatch(/references auth\.users\s*\(id\)\s*on delete cascade/i);
  });

  it("grants exactly four policies (select/insert/update/delete), every one to 'authenticated' only, never 'anon'/'public'", () => {
    const policyLines = sql.match(/create policy[\s\S]*?;/gi) ?? [];
    expect(policyLines).toHaveLength(4);
    for (const policy of policyLines) {
      expect(policy).toMatch(/to authenticated/i);
      expect(policy).not.toMatch(/to anon/i);
      expect(policy).not.toMatch(/to public/i);
    }
  });

  it("every policy scopes to the caller's own row via auth.uid() -- select/insert/update/delete each named explicitly", () => {
    for (const clause of ["for select", "for insert", "for update", "for delete"]) {
      const policy = sql
        .match(/create policy[\s\S]*?;/gi)
        ?.find((line) => new RegExp(clause, "i").test(line));
      expect(policy, `expected a "${clause}" policy`).toBeDefined();
      expect(policy).toMatch(/user_id\s*=\s*auth\.uid\(\)/);
    }
  });

  it("never GRANTs anything to service_role, and declares no function at all (so no SECURITY DEFINER RPC either) -- table access is plain RLS only (the migration's own comments legitimately mention the app-level service-role client that reads this table from outside RLS, and note that no SECURITY DEFINER RPC is needed here, neither of which is a SQL grant/definition)", () => {
    expect(sql).not.toMatch(/grant[\s\S]{0,80}to\s+service_role/i);
    expect(sql).not.toMatch(/create (or replace )?function/i);
  });

  it("stores no personal metadata beyond what the feed actually needs (no denormalized email/name)", () => {
    for (const forbidden of ["email", "name", "personnel"]) {
      expect(sql.toLowerCase()).not.toMatch(new RegExp(`^\\s*${forbidden}\\s+\\w`, "m"));
    }
  });
});
