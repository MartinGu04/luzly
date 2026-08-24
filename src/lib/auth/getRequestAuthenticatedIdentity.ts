import "server-only";
import { cache } from "react";
import { getAuthenticatedIdentity } from "./currentUser";

/**
 * Request-scoped memoization of `getAuthenticatedIdentity()`, via React's
 * `cache()` -- the SAME per-request dedup primitive `getRequestPersonalSchedule`/
 * `getRequestManagerOverview`/`getWorkbookSnapshot`'s own in-flight dedup layer
 * already rely on. This is deliberately a THIRD, distinct kind of "cache" from
 * the other two this codebase uses, and the difference matters:
 *
 * 1. THIS wrapper (`cache()`, request-scoped): reset for every new
 *    request/render, never shared across users or across requests. It only
 *    stops the SAME live `getUser()` verification from being repeated
 *    several times within one render pass (e.g. the protected layout's own
 *    `getRequestPersonalSchedule()` call and a manager-only loader's
 *    authorization check both needing "who is this?" during the same
 *    `/manager` request) -- it never makes identity resolution stale, since
 *    a brand new request always gets a brand new live check.
 * 2. The 30-second shared RAW WORKBOOK snapshot cache
 *    (`lib/sync/workbookSnapshotCache.ts`, `unstable_cache`): caches
 *    non-personal, shared spreadsheet data ACROSS requests/users for a
 *    short TTL. It never holds identity, session, or any per-user
 *    authorization decision.
 * 3. Any cache of AUTHENTICATED/PERSONAL Manager or personal-schedule
 *    OUTPUT, persisted across requests: forbidden outright by this app's
 *    engineering rules. This file never introduces anything like that --
 *    it only memoizes the raw identity check itself, only for the
 *    lifetime of one request, and every read model built from it is still
 *    computed fresh every single request.
 *
 * Safe to call from multiple independent loaders on the same request
 * (`personalSchedule.ts`, `managerWorkbookContext.ts`, ...) -- they all
 * share the one live Supabase `getUser()` call this produces, rather than
 * each triggering their own.
 */
export const getRequestAuthenticatedIdentity = cache(getAuthenticatedIdentity);
