import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/auth/AccessDeniedScreen";
import { CalendarSyncSection } from "@/components/calendar/CalendarSyncSection";
import { getCalendarFeedForCurrentUser } from "@/lib/calendar/feedStore";
import { buildCalendarFeedLinks } from "@/lib/calendar/feedUrl";
import { resolveRequestOrigin } from "@/lib/calendar/requestOrigin";
import { getRequestPersonalSchedule } from "@/lib/readModels/getRequestPersonalSchedule";

/**
 * "סנכרון יומן" (formerly labeled "הגדרות") -- currently just calendar sync
 * (PR: personal calendar subscription), the app's first genuine
 * settings/profile destination. Renamed (nav redesign pass) since this
 * destination has never been anything but calendar sync -- "הגדרות" implied
 * a broader settings surface that never existed. Route unchanged (/settings),
 * wording-only.
 * Re-verifies identity the same way every other protected page does
 * (`getRequestPersonalSchedule()`, request-scoped cached -- reuses the
 * SAME call the protected layout already made, no second Google read),
 * but unlike most of those pages, this one renders for BOTH "ok" and
 * "configuration_error": calendar sync itself never depends on the
 * shift-schedule configuration (only on the person's own identity), so a
 * broken "תחילת משמרת יום" setting has no reason to block it.
 */
export default async function SettingsPage() {
  const result = await getRequestPersonalSchedule();

  if (result.status === "unauthenticated") {
    redirect("/login");
  }
  if (result.status === "missing_email" || result.status === "unmapped" || result.status === "ambiguous_identity") {
    return <AccessDeniedScreen />;
  }

  const [feed, origin] = await Promise.all([getCalendarFeedForCurrentUser(), resolveRequestOrigin()]);
  const initialLinks = feed.enabled && feed.token && origin ? buildCalendarFeedLinks(origin, feed.token) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">סנכרון יומן</h1>
      <CalendarSyncSection initialEnabled={feed.enabled} initialLinks={initialLinks} />
    </div>
  );
}
