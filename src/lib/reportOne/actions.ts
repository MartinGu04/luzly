"use server";

import { classifyReportOneSection } from "@/lib/domain/reportOne";
import { loadManagerPersonnelContext } from "@/lib/readModels/managerWorkbookContext";
import { setReserveInclusionPreference } from "./store";

export type SetReserveInclusionActionResult = { ok: true } | { ok: false; error: string };

/**
 * Persists ONE reserve (מילואים) person's "include in Report 1" copy
 * preference (see this repo's Report 1 reserve-inclusion spec).
 * Manager-gated via `loadManagerPersonnelContext` -- the same lightweight
 * boundary other manager config/polling actions use (`ruleActions.ts`'s
 * `setCustomWeeklyRuleEnabledAction`) -- and re-validates `personId`
 * against a FRESH roster, requiring `classifyReportOneSection(...) ===
 * "reserve"` before writing anything, exactly like
 * `updateSystemRuleAction` re-validates target ids: a client-supplied id
 * that isn't a genuine current reserve roster member fails the whole
 * request, never silently accepted. This also structurally keeps the
 * existing hard Report 1 exclusions (דימה מירו/מרטין בדיקות/נדב וקנין)
 * inert either way -- even if a preference row somehow existed for one
 * of them, `buildReportOneDraft` never places them in any section, so
 * that row is never read back into a rendered Report 1.
 *
 * Confirmation (the "will you really remove someone with a real
 * assignment tomorrow" warning) is a UI-level safeguard decided from the
 * ALREADY-loaded draft the editor is showing -- this action only ever
 * persists what the caller already confirmed; it never re-derives
 * tomorrow's schedule itself.
 */
export async function setReserveInclusionPreferenceAction(personId: string, included: boolean): Promise<SetReserveInclusionActionResult> {
  if (typeof personId !== "string" || personId.length === 0) return { ok: false, error: "invalid_request" };
  if (typeof included !== "boolean") return { ok: false, error: "invalid_request" };

  const contextResult = await loadManagerPersonnelContext();
  if (contextResult.status !== "ok") return { ok: false, error: contextResult.status };

  const { manager, people } = contextResult.context;
  const person = people.find((candidate) => candidate.id === personId);
  if (!person || classifyReportOneSection(person) !== "reserve") {
    return { ok: false, error: "invalid_target" };
  }

  await setReserveInclusionPreference(personId, included, manager.id, manager.name);
  return { ok: true };
}
