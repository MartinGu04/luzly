import { signOutAction } from "@/lib/auth/actions";

/**
 * The single generic "you're signed in, but Luzly won't let you in" screen,
 * used for every denial state (unmapped email, no usable email, ambiguous
 * identity) — deliberately the same message for all of them, so the UI
 * itself can never hint which specific case applies. No personnel names,
 * emails, or workbook details are ever rendered here.
 */
export function AccessDeniedScreen() {
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
