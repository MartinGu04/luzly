import "server-only";
import { describeSystemRule, SYSTEM_RULE_DETAILS_PLACEHOLDER } from "@/lib/presentation/notificationRules";
import type { SystemRuleConfig, SystemRuleKey } from "./ruleConfig";

/**
 * The ONE place a system reminder's built-in title/body is combined with
 * a manager's saved override -- every one of the 10 categories in
 * `reminders.ts` calls this instead of hand-rolling its own `?? `/
 * template logic, so there is exactly one implementation of "how an
 * override applies" to ever get right (spec: "Centralize applying
 * system-rule copy configuration").
 *
 * `builtIn.body` means two different things depending on the category's
 * own `bodyKind` (the presentation-layer catalog, `describeSystemRule`)
 * -- callers never decide this themselves, so the classification stays
 * in exactly one place:
 *
 *  - `static_editable`: `builtIn.body` IS the full built-in body. A
 *    saved override REPLACES it outright.
 *  - `dynamic_details_required`: `builtIn.body` is the existing trusted,
 *    per-occurrence dynamically-generated sentence ("details") -- the
 *    ACTUAL runtime domain facts (shift time, duty type, assignee names,
 *    ...), computed by the caller exactly as before this feature existed.
 *    A saved override is a TEMPLATE containing `{details}` (validated
 *    server-side at save time, `ruleActions.ts`, to guarantee this), and
 *    is never used verbatim -- `{details}` is substituted with the real
 *    details so the dynamic facts can never be lost. No override at all
 *    means the details ARE the body, unchanged from today's behavior.
 *
 * Title is uniform either way: a saved override replaces the built-in
 * title outright; no override leaves it unchanged. This never duplicates
 * the shift/duty/logistics business logic that COMPUTES `builtIn.title`/
 * `builtIn.body` in the first place -- that stays exactly where it
 * already lived, in each `reminders.ts` function's own domain logic.
 */
export function applySystemRuleCopy(
  systemKey: SystemRuleKey,
  rule: Pick<SystemRuleConfig, "titleOverride" | "bodyOverride">,
  builtIn: { title: string; body: string },
): { title: string; body: string } {
  const title = rule.titleOverride ?? builtIn.title;

  const { bodyKind } = describeSystemRule(systemKey);
  if (bodyKind === "dynamic_details_required") {
    const body = rule.bodyOverride ? rule.bodyOverride.replace(SYSTEM_RULE_DETAILS_PLACEHOLDER, builtIn.body) : builtIn.body;
    return { title, body };
  }

  const body = rule.bodyOverride ?? builtIn.body;
  return { title, body };
}
