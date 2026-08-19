# lib/calendar

Personal ICS calendar subscription feed -- each user can enable a private,
token-gated feed of their own shifts/duties/absences that Google/Apple
Calendar (or any ICS-subscription-capable app) polls on its own schedule.
One-way sync only: מי-מה-מו never reads or writes anything back to a
user's external calendar. Reuses the existing domain/parser layers for
every scheduling fact -- this directory contains no parallel schedule data
model, only the calendar-feed-specific plumbing around it.

- `token.ts` (server-only) -- `generateCalendarFeedToken()`, a 256-bit
  `crypto.randomBytes` base64url token. The ONLY thing that authorizes
  `GET /calendar/<token>.ics` (see `src/app/calendar/[token]/route.ts`) --
  external calendar clients never carry a Supabase session.
- `feedStore.ts` (server-only) -- RLS-scoped enable/reset/disable/status
  for the CURRENTLY authenticated user's own `calendar_feeds` row (see
  `supabase/migrations/20260820090000_create_calendar_feeds.sql`).
  Deliberately stores the token in plain text, not hashed -- see the
  migration's own comment for why (the product needs "Copy Link"/"Add to
  Google/Apple Calendar" to keep working at any time while sync stays
  enabled, not only once at creation).
- `serviceClient.ts` (server-only) -- the ONE call site for this feature's
  privileged (RLS-bypassing) Supabase access, used only by
  `feedOwnerLookup.ts`. The SECOND legitimate service-role call site in
  the whole codebase, alongside the notification worker's own
  `lib/notifications/engine/serviceClient.ts` -- see
  `src/app/notificationServiceRoleBoundary.test.ts`.
- `feedOwnerLookup.ts` (server-only) -- `resolveCalendarFeedOwnerByToken`,
  the token -> owning Supabase user's email lookup the ICS route needs
  (no session to resolve identity from otherwise).
- `loadCalendarFeedForToken.ts` (server-only) -- the ICS route's whole
  pipeline: token -> owner's email -> matching כ"א `Person` (same
  fail-closed email-only match `resolveCurrentPerson` uses for a normal
  session) -> that person's own Events -> rendered ICS text.
- `icsItems.ts` (server-only) -- `buildCalendarItem`, turning one
  shift/duty/absence `Event` into a stable-UID, correctly-timed
  `IcsCalendarItem`. `calendarEventUid` is keyed on the Event's own
  spreadsheet origin (`sourceSheet`+`sourceCell`) -- this is what makes
  the feed a real subscription: editing an assignment's text keeps the
  same UID (an update, not a duplicate), and a removed/reassigned cell
  simply stops appearing in the next generation.
- `icsRender.ts` / `icsEncoding.ts` (pure) -- RFC 5545 VCALENDAR/VEVENT
  text rendering and escaping/line-folding, independently testable with
  no Supabase/Google/domain dependency at all.
- `feedUrl.ts` (pure) / `requestOrigin.ts` (server-only) -- the feed's
  HTTPS/`webcal://`/Google-"add by URL" link shapes, and resolving the
  current request's own origin to build them.
- `actions.ts` (`"use server"`) -- `enableCalendarSyncAction` /
  `resetCalendarSyncAction` / `disableCalendarSyncAction`, the settings
  page's mutation entry points. Every one re-verifies the caller's
  identity itself (`getAuthenticatedIdentity()`) -- never trusts a
  client-supplied user id.

## Known calendar-provider limitations

- **Google Calendar's own refresh interval is coarse and not
  configurable** (observed anywhere from several hours to about a day),
  regardless of this feed's `REFRESH-INTERVAL`/`X-PUBLISHED-TTL` hints
  (which Google ignores entirely). This app's existing push-notification
  system remains the only channel for timely alerts -- a subscribed
  calendar is never a substitute for it.
- **Google's "add by URL" flow has no reliable one-tap mobile
  equivalent.** `googleCalendarSubscribeUrl` (the `calendar.google.com/
  calendar/r?cid=...` deep link) works reliably on desktop web; on the
  Google Calendar mobile app it does not consistently deep-link the same
  way. "Copy Link" + Google Calendar's own Settings -> Add calendar ->
  From URL screen is the safe, reliable fallback on every platform.
- **Apple's `webcal://` scheme has no such limitation** -- it triggers
  the native "Add Subscription" sheet directly on macOS/iOS.
