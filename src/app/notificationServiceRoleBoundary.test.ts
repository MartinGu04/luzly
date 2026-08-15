import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * PR #30's regression guard for the ONE privileged (RLS-bypassing)
 * Supabase client this codebase now has: `createSupabaseServiceRoleClient`
 * (`src/lib/supabase/serviceRoleClient.ts`). Mirrors the existing
 * boundary-guard pattern (`apiSurface.test.ts`, `login/loginBoundary.test.ts`)
 * -- text-level scans, not a lint rule, matching this codebase's
 * established convention.
 *
 * Two invariants:
 *  1. `createSupabaseServiceRoleClient` is referenced by name in exactly
 *     two files: its own definition, and
 *     `src/lib/notifications/engine/serviceClient.ts` (the engine's
 *     single call site). No other file -- not a route, not a Server
 *     Component/Action, not a client component -- may import or call it
 *     directly.
 *  2. No "use client" component, and no file under `src/app` reachable
 *     from ordinary user navigation, ever references
 *     `SUPABASE_SERVICE_ROLE_KEY` or `NOTIFICATION_WORKER_SECRET` --
 *     both are server-only secrets that must never reach a browser
 *     bundle.
 */
function findSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const srcRoot = path.resolve(__dirname, "..");
const sourceFiles = findSourceFiles(srcRoot);

const SERVICE_ROLE_DEFINITION_FILE = path.join(srcRoot, "lib", "supabase", "serviceRoleClient.ts");
const SERVICE_ROLE_CALL_SITE_FILE = path.join(srcRoot, "lib", "notifications", "engine", "serviceClient.ts");
const ALLOWED_SERVICE_ROLE_REFERENCE_FILES = new Set([
  SERVICE_ROLE_DEFINITION_FILE,
  SERVICE_ROLE_CALL_SITE_FILE,
]);

describe("notification worker service-role boundary guard", () => {
  it("finds source files (sanity check the scan itself works)", () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("createSupabaseServiceRoleClient is referenced by name only in its definition and the engine's single call site", () => {
    const referencingFiles = sourceFiles.filter((file) =>
      /createSupabaseServiceRoleClient/.test(fs.readFileSync(file, "utf8")),
    );
    expect(new Set(referencingFiles)).toEqual(ALLOWED_SERVICE_ROLE_REFERENCE_FILES);
  });

  it("no 'use client' component ever references the service-role key, worker secret, or service-role client", () => {
    const clientComponentFiles = sourceFiles.filter((file) =>
      fs.readFileSync(file, "utf8").startsWith('"use client"'),
    );
    expect(clientComponentFiles.length).toBeGreaterThan(0);

    const FORBIDDEN_PATTERNS = [
      /SUPABASE_SERVICE_ROLE_KEY/,
      /NOTIFICATION_WORKER_SECRET/,
      /createSupabaseServiceRoleClient/,
      /getNotificationServiceClient/,
    ];
    for (const file of clientComponentFiles) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  it("no route handler outside the internal notification worker ever references the worker secret or service-role client", () => {
    function findRouteFiles(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      let results: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(findRouteFiles(fullPath));
        } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
          results.push(fullPath);
        }
      }
      return results;
    }

    const workerRouteFile = path.join(srcRoot, "app", "internal", "notifications", "tick", "route.ts");
    const otherRouteFiles = findRouteFiles(path.resolve(__dirname)).filter((file) => file !== workerRouteFile);
    expect(otherRouteFiles.length).toBeGreaterThan(0);

    const FORBIDDEN_PATTERNS = [
      /SUPABASE_SERVICE_ROLE_KEY/,
      /NOTIFICATION_WORKER_SECRET/,
      /createSupabaseServiceRoleClient/,
      /getNotificationServiceClient/,
    ];
    for (const file of otherRouteFiles) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
