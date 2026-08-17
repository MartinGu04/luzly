import { redirect } from "next/navigation";

/**
 * PR #4 -- `/manager/fairness` (the old manager-only "טבלת צדק" screen,
 * PR #15) is removed in favor of the standalone `/fairness` experience,
 * available to every mapped user, not just managers. This route stays as a
 * permanent redirect rather than a 404 so an existing bookmark/shared link
 * keeps working -- it always lands on Duty mode (`?mode=duties`), the
 * closest equivalent to what this screen used to show; H1/H2 period
 * selection resolves the same way it always did (the current period, via
 * `resolveFairnessPeriod`), just one navigation later.
 */
export default function ManagerFairnessRedirectPage() {
  redirect("/fairness?mode=duties");
}
