import { signOutAction } from "@/lib/auth/actions";
import { APP_NAME } from "@/lib/config/productName";
import { Panel } from "@/components/ui/Panel";

/**
 * The single generic "you're signed in, but the app won't let you in"
 * screen, used for every denial state (unmapped email, no usable email,
 * ambiguous identity) — deliberately the same message for all of them, so
 * the UI itself can never hint which specific case applies. No personnel
 * names, emails, or workbook details are ever rendered here.
 */
export function AccessDeniedScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Panel variant="hero" className="w-full max-w-sm text-center">
        <h1 className="text-lg font-bold text-foreground">אין לך הרשאה ל-{APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted">פנה/י למנהל המערכת אם לדעתך זו טעות.</p>
        <form action={signOutAction} className="mt-6">
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-sm font-medium text-primary underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            התנתקות
          </button>
        </form>
      </Panel>
    </div>
  );
}
