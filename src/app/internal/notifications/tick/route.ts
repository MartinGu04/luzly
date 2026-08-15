import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedWorkerRequest } from "@/lib/notifications/workerAuth";
import { runNotificationWorkerTick, type WorkerMode } from "@/lib/notifications/engine/pipeline";

/**
 * The secured internal worker endpoint Supabase Cron calls every 5
 * minutes in production (PR #30 spec section 3). Deliberately placed
 * OUTSIDE `src/app/api` -- `src/app/apiSurface.test.ts`'s existing "37.
 * no public schedule/personnel API route exists yet" regression test
 * asserts `src/app/api` does not exist at all, and this endpoint (secret-
 * gated, never public) doesn't need that directory to satisfy the
 * task's conceptual "/api/internal/notifications/tick" path -- keeping
 * it here avoids touching an existing security regression test for a
 * path choice that doesn't matter functionally. See the PR description
 * for this deliberate substitution.
 *
 * Auth: `Authorization: Bearer <NOTIFICATION_WORKER_SECRET>`, checked
 * with a constant-time comparison (`isAuthorizedWorkerRequest`) BEFORE
 * anything else runs -- no fresh Google read, no Supabase access, no
 * work of any kind happens for an unauthorized request.
 *
 * Mode: `?mode=send` for a real send (used by Supabase Cron in
 * production, and for an explicit Preview real-send test); anything
 * else (including no `mode` at all) is a side-effect-free dry run --
 * spec section 24 default-safe behavior, so an accidental or malformed
 * request never sends push notifications.
 *
 * Response is a small, PII-safe JSON summary of counts only -- never a
 * name, email, push endpoint, or full notification body (spec section
 * 25).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorized = isAuthorizedWorkerRequest(request.headers.get("authorization"));
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const modeParam = request.nextUrl.searchParams.get("mode");
  const mode: WorkerMode = modeParam === "send" ? "send" : "dry_run";

  try {
    const result = await runNotificationWorkerTick(mode);

    if (result.status === "configuration_error") {
      console.error("[notifications] worker configuration error");
      return NextResponse.json({ error: "configuration_error" }, { status: 500 });
    }

    return NextResponse.json(result.summary, { status: 200 });
  } catch {
    console.error("[notifications] worker tick failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
