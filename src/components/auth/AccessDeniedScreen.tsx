import { signOutAction } from "@/lib/auth/actions";
import { APP_NAME } from "@/lib/config/productName";
import { Panel } from "@/components/ui/Panel";
import { AccessDeniedSignOutButton } from "./AccessDeniedSignOutButton";

/**
 * The single generic "you're signed in, but the app won't let you in"
 * screen, used for every denial state (unmapped email, no usable email,
 * ambiguous identity) — deliberately the same message for all of them, so
 * the UI itself can never hint which specific case applies. No personnel
 * names, emails, or workbook details are ever rendered here.
 */
export function AccessDeniedScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Panel variant="hero" className="w-full max-w-sm text-center">
        <h1 className="text-xl font-bold text-foreground">אין לך הרשאה ל-{APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted">פנה/י למנהל המערכת אם לדעתך זו טעות.</p>
        <form action={signOutAction} className="mt-6">
          <AccessDeniedSignOutButton />
        </form>
      </Panel>
    </div>
  );
}
