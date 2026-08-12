import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AccessDeniedScreen } from "@/components/auth/AccessDeniedScreen";
import { resolveCurrentPerson } from "@/lib/auth/resolveCurrentPerson";

/**
 * Every route here resolves a specific authenticated user's identity, so
 * it must never be statically generated/cached at build or request time —
 * that's exactly the kind of caching that could leak one user's resolved
 * identity to another. This also means `next build` never has to reach
 * live Supabase/Google config while prerendering this route.
 */
export const dynamic = "force-dynamic";

/**
 * Protects every route under this group server-side.
 *
 * Only a genuinely unauthenticated visitor is redirected to /login (no
 * client useEffect redirect, no flash of protected content). Every other
 * non-"ok" state is an authenticated user Luzly still denies access to —
 * no usable email, an email absent from כ"א, or an email matching more
 * than one כ"א record — and none of those are redirected back into the
 * login flow (that would loop); they all get the same generic denial
 * screen instead of app content, revealing no personnel names, emails,
 * or workbook details either way.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const result = await resolveCurrentPerson();

  if (result.status === "unauthenticated") {
    redirect("/login");
  }

  if (result.status !== "ok") {
    return <AccessDeniedScreen />;
  }

  return (
    <AppShell person={{ name: result.person.name, isManager: result.person.isManager }}>
      {children}
    </AppShell>
  );
}
