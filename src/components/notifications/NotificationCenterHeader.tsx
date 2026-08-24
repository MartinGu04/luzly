/**
 * "/notifications" page title -- "מרכז התראות". Deliberately its OWN header,
 * never `ManagerHeader` ("אזור מנהל") -- מרכז התראות is a separate top-level
 * product surface, not a subsection of the Manager Area (see
 * `app/(app)/notifications/page.tsx`'s own docstring): reusing
 * `ManagerHeader` here would visually read as though this page still lived
 * inside "אזור מנהל". Presentation text only -- server-side authorization
 * (`getRequestNotificationCenterContext`) is the sole gate, untouched by
 * this component.
 */
export function NotificationCenterHeader() {
  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">מרכז התראות</h1>
      <p className="mt-1.5 text-sm text-muted">שליחה, תזמון וניהול התראות לצוות.</p>
    </div>
  );
}
