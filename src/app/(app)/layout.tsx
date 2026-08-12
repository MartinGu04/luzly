import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { signOutAction } from "@/lib/auth/actions";
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
 * Protects every route under this group server-side: an unauthenticated
 * visitor is redirected to /login before any protected content renders
 * (no client useEffect redirect, no flash of protected content). An
 * authenticated-but-unmapped user (valid Google/Supabase login, but the
 * email isn't in כ"א) gets an explicit denial screen instead of app
 * content, with no personnel names/emails/workbook details revealed.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const result = await resolveCurrentPerson();

  if (result.status === "unauthenticated") {
    redirect("/login");
  }

  if (result.status === "unmapped") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
          <h1 className="text-lg font-bold text-foreground">אין לך הרשאה ל-Luzly</h1>
          <p className="mt-2 text-sm text-muted">
            פנה/י למנהל המערכת אם לדעתך זו טעות.
          </p>
          <form action={signOutAction} className="mt-6">
            <button
              type="submit"
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              התנתקות
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AppShell person={{ name: result.person.name, isManager: result.person.isManager }}>
      {children}
    </AppShell>
  );
}
