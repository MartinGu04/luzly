# lib/notifications

Supabase-backed orchestration for Web Push subscriptions (PR #29) --
the equivalent role `lib/sync` plays for the workbook snapshot cache,
but for push subscription persistence. Composes `lib/push` (pure
mechanics, no Supabase) with `lib/supabase` (the generic client
boundary) and `lib/auth` (identity).

- `subscriptionStore.ts` (server-only) -- `upsertPushSubscriptionForCurrentUser`,
  `deletePushSubscriptionForCurrentUser`, `findPushSubscriptionForCurrentUser`.
  Every function derives ownership from the current Supabase session
  (`createSupabaseServerClient()`, RLS-scoped) -- never a client-supplied
  user id. Creation/reassignment always goes through the
  `upsert_push_subscription` RPC (see `supabase/migrations/`), never a
  plain `.insert()`/`.update()`.
- `actions.ts` (`"use server"`) -- the four Server Actions the UI calls:
  `enablePushNotificationsAction`, `disablePushNotificationsAction`,
  `getPushSubscriptionStatusAction`, `sendTestNotificationAction`. Each
  checks `getAuthenticatedIdentity()` first and fails closed for an
  unauthenticated caller, malformed input, or a subscription the caller
  doesn't own -- see each function's own docstring.

`lib/auth/actions.ts`'s `signOutAction` also imports
`deletePushSubscriptionForCurrentUser` directly (not through `actions.ts`)
for best-effort logout cleanup of the current device's subscription --
see that file's own docstring for why cleanup can never block sign-out.

## Notification preferences -- intended future extension point

This PR only supports a single global on/off per device (no per-category
preferences yet, per its own scope). When a future PR needs per-category
opt-in/out (shift reminders vs. schedule changes vs. team changes vs.
duty reminders vs. duty changes vs. constraints reminders vs. manager
coverage alerts), the natural extension is a `notification_preferences`
column (`jsonb`, defaulting to "all categories on") on
`push_subscriptions` -- or a separate small table if it needs to be
queried/updated independently of the subscription row's own lifecycle.
Whichever shape is chosen, it should NOT require re-subscribing the
browser's `PushSubscription` -- preferences are a pure server-side
filter over which category of payload gets sent to an already-persisted
subscription, decided at send time (in `lib/push`/the future
notification-rules layer), not something the client needs to
renegotiate with the push service.

Do not add this schema prematurely -- it doesn't simplify anything this
PR needs, and the actual shape should be driven by the real categories
the notification-rules PR ends up sending.

## PR #30 -- the automatic notification engine

`engine/` (server-only throughout) is the scheduled worker that turns
Google Sheet operational data into automatic push notifications, sitting
on top of this directory's PR #29 delivery primitives. See
`engine/README.md` for the module layout, and
`src/app/internal/notifications/tick/route.ts` for the secured entry
point Supabase Cron calls every 5 minutes in production.

### PR #79 + minute-level precision follow-up -- manager scheduled broadcasts

A manager can schedule a manual broadcast for a future Asia/Jerusalem
instant instead of sending it immediately. Minute-level dispatch
precision is owned PRIMARILY by a second, much narrower dedicated worker
-- `src/app/internal/notifications/scheduled/route.ts`, driven by
Supabase Cron once a MINUTE -- with the main 5-minute tick above also
still dispatching due schedules as a deliberate fallback, in case the
dedicated worker's manually-configured Cron job is ever missing,
disabled, or broken (see `engine/README.md`'s own section for why
overlapping callers of the same claim are safe). The manager's open
communication screen reflects a background dispatch via lightweight
polling, never Realtime/WebSocket -- see
`components/manager/ManagerScheduledBroadcastsSection.tsx` and
`ManagerRecentBroadcastsSection.tsx`.
