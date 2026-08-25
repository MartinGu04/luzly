"use server";

import { getAuthenticatedIdentity } from "@/lib/auth/currentUser";
import { recordDashboardVisit } from "./store";

export type RecordDashboardVisitResult = { ok: true } | { ok: false; error: string };

/**
 * Records the authenticated caller's CURRENT Home visit -- the one
 * manager-independent Server Action `DashboardVisitMarker` calls after
 * the Home screen has genuinely mounted client-side (never during server
 * render -- see that component's own docstring for why).
 *
 * Re-derives the authenticated identity server-side (`getAuthenticatedIdentity()`,
 * live `auth.getUser()` re-verification) and NEVER accepts a client-
 * supplied user id -- `visitStartedAtIso` is the only client-supplied
 * input, and it is validated conservatively before ever reaching the
 * store: it must parse as a real instant, and is clamped down to "now"
 * if it somehow arrives from the future (clock skew, a malformed value).
 * That clamp only ever affects what the calling user sees on their OWN
 * next visit -- it can never affect another user's data, and it can
 * never move a user's stored cutoff backwards either way (the store's
 * own `record_dashboard_visit` RPC is monotonic regardless).
 *
 * Never throws: this write is best-effort and optional by design. A
 * failure here must never surface to the user or break the Home screen
 * -- it only risks the user seeing some already-recapped changes again
 * on their NEXT visit, which is the deliberately preferred failure mode
 * over ever silently losing an unseen one (see PR spec section 16).
 */
export async function recordDashboardVisitAction(visitStartedAtIso: string): Promise<RecordDashboardVisitResult> {
  const identity = await getAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false, error: "not_authenticated" };

  const visitedAtMs = Date.parse(visitStartedAtIso);
  if (!Number.isFinite(visitedAtMs)) return { ok: false, error: "invalid_timestamp" };

  const nowMs = Date.now();
  const safeVisitedAtIso = new Date(Math.min(visitedAtMs, nowMs)).toISOString();

  try {
    await recordDashboardVisit(identity.userId, safeVisitedAtIso);
    return { ok: true };
  } catch {
    console.error("[dashboard] visit marker write failed");
    return { ok: false, error: "write_failed" };
  }
}
