"use server";

import { revalidatePath } from "next/cache";
import { getRequestAuthenticatedIdentity } from "@/lib/auth/getRequestAuthenticatedIdentity";
import { loadManagerPersonnelContext } from "@/lib/readModels/managerWorkbookContext";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { activateEmergencyMode, deactivateEmergencyMode } from "./store";
import type { EmergencyModeActivationStatus, EmergencyModeDeactivationStatus } from "./types";

export type EmergencyModeActionResult =
  | { ok: true; status: EmergencyModeActivationStatus | EmergencyModeDeactivationStatus }
  | { ok: false; error: string };

/**
 * Manager-only activation. Re-derives the acting manager's identity
 * server-side via `loadManagerPersonnelContext()` -- the SAME trusted
 * manager-authorization boundary every other manager-only Server Action
 * in this codebase uses (see `shootingRanges/actions.ts`). Never trusts
 * a client-supplied `isManager` flag, person id, or name; `manager.id`/
 * `manager.name` below are always freshly re-verified against the
 * roster, not anything the browser sent.
 *
 * `startDate` is derived from `getJerusalemLocalNow()` at the moment of
 * activation -- Asia/Jerusalem calendar date, so the "dates are atomic"
 * rule (spec section 1) has a well-defined date even for an activation
 * that happens right around local midnight.
 *
 * Idempotent: a double-click (or a race with another manager's tab)
 * resolves atomically in `activate_emergency_mode` (see that RPC's own
 * docstring) -- this action never creates two active periods, and
 * reports `"already_active"` rather than erroring when that happens.
 */
export async function activateEmergencyModeAction(): Promise<EmergencyModeActionResult> {
  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const identity = await getRequestAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false, error: "unauthenticated" };

  const { manager } = contextResult.context;
  const startDate = getJerusalemLocalNow().date;

  const result = await activateEmergencyMode(identity.userId, manager.id, manager.name, startDate);

  // Revalidates the authenticated (app) layout and every page beneath
  // it, so the acting manager (and, on their next request, every other
  // authenticated user) immediately sees the new Emergency Mode state
  // rather than a stale client-only boolean -- see `revalidatePath`'s
  // own docs ("Revalidating all data") for why `("/", "layout")` is the
  // correct call to invalidate the whole authenticated app shell.
  revalidatePath("/", "layout");

  return { ok: true, status: result.status };
}

/** Manager-only deactivation -- same trusted-manager boundary and idempotency guarantee as activation above, in reverse. */
export async function deactivateEmergencyModeAction(): Promise<EmergencyModeActionResult> {
  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const identity = await getRequestAuthenticatedIdentity();
  if (identity.status !== "authenticated") return { ok: false, error: "unauthenticated" };

  const { manager } = contextResult.context;
  const endDate = getJerusalemLocalNow().date;

  const result = await deactivateEmergencyMode(identity.userId, manager.id, manager.name, endDate);

  revalidatePath("/", "layout");

  return { ok: true, status: result.status };
}
