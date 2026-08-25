import "server-only";
import { getDashboardVisitServiceClient } from "./serviceClient";

/**
 * This user's last genuine Home-visit instant, or `null` when none has
 * ever been recorded. `null` is the ordinary, expected FIRST-visit state
 * -- never throws on a missing row, same convention as
 * `getInboxClearedBefore` (`lib/notifications/engine/store.ts`).
 *
 * Callers must treat `null` as "this is the user's baseline visit": no
 * historical recap is shown, and nothing is queried against
 * `notification_jobs` for it -- see `loadDashboardVisitRecap`.
 */
export async function getLastVisitedAt(userId: string): Promise<string | null> {
  const supabase = getDashboardVisitServiceClient();
  const { data, error } = await supabase
    .from("dashboard_visit_state")
    .select("last_visited_at")
    .eq("user_id", userId)
    .maybeSingle<{ last_visited_at: string }>();
  if (error) throw error;
  return data?.last_visited_at ?? null;
}

/**
 * Records `userId`'s current Home visit. The ONLY writer of
 * `dashboard_visit_state`, and always goes through the
 * `record_dashboard_visit` RPC (never a plain `.upsert()`) -- that RPC's
 * `greatest(...)` merge is what makes this call idempotent AND monotonic:
 * calling it twice, or out of order, can never move the stored cutoff
 * backwards. See the migration's own doc comment for exactly why that
 * matters (the render -> mount-marker race).
 */
export async function recordDashboardVisit(userId: string, visitedAtIso: string): Promise<void> {
  const supabase = getDashboardVisitServiceClient();
  const { error } = await supabase.rpc("record_dashboard_visit", {
    p_user_id: userId,
    p_visited_at: visitedAtIso,
  });
  if (error) throw error;
}
