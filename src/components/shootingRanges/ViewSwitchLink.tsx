import Link from "next/link";

interface ViewSwitchLinkProps {
  href: string;
  label: string;
}

/**
 * The small reciprocal "switch view" link shared by the personal
 * (`/shooting-ranges`) and manager (`/shooting-ranges/manager`) pages --
 * "תצוגת מנהל" on one side, "לתצוגה האישית" on the other. Identical visual
 * treatment on both, and identical to the existing lightweight text-link
 * pattern already used elsewhere in the app (e.g. the sign-out affordance)
 * -- deliberately NOT a button/primary action, so the pair reads as one
 * simple back-and-forth navigation affordance, not a new feature.
 * Authorization for the manager destination is enforced server-side by
 * `/shooting-ranges/manager` itself (`loadShootingRangeManagerOverview`'s
 * manager gate) -- this component renders unconditionally wherever its
 * caller decides to place it; the caller (the page) is what decides
 * whether the viewer is allowed to see the link at all (e.g. `isManager`).
 */
export function ViewSwitchLink({ href, label }: ViewSwitchLinkProps) {
  return (
    <Link href={href} className="text-sm text-primary hover:underline">
      {label}
    </Link>
  );
}
