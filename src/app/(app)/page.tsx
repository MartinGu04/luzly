import { Dashboard } from "@/components/dashboard/Dashboard";
import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import { getRequestPersonalSchedule } from "@/lib/readModels/getRequestPersonalSchedule";

/**
 * By the time this page renders, the protected layout has already gated
 * unauthenticated/unmapped/missing_email/ambiguous_identity visitors --
 * only `ok` and `configuration_error` can reach here. Calling
 * `getRequestPersonalSchedule()` again reuses the SAME request-scoped
 * result the layout already computed (React `cache()`), so this performs
 * no additional Google request.
 */
export default async function DashboardPage() {
  const result = await getRequestPersonalSchedule();

  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  return <Dashboard model={result.model} />;
}
