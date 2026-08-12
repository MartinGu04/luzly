import { signOutAction } from "@/lib/auth/actions";

interface IdentityFooterProps {
  name: string;
  isManager: boolean;
}

/** Minimal identity affordance for the protected shell: name + sign out. Not a redesign. */
export function IdentityFooter({ name, isManager }: IdentityFooterProps) {
  return (
    <div className="border-t border-white/10 px-3 py-3">
      <p className="truncate text-sm font-medium text-white">{name}</p>
      {isManager ? <p className="text-xs text-sidebar-muted">מנהל/ת</p> : null}
      <form action={signOutAction} className="mt-2">
        <button
          type="submit"
          className="text-xs font-medium text-sidebar-muted underline-offset-2 hover:text-white hover:underline"
        >
          התנתקות
        </button>
      </form>
    </div>
  );
}
