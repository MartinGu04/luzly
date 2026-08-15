# components

- `layout/` — app shell, right-side desktop `Sidebar`, mobile `BottomNav`
  (replacing the old hamburger/drawer), `IdentityFooter`, `ShellUtilityBar`
  (the desktop-only top utility row hosting the app's one live clock —
  Design Pass PR #19).
- `ui/` — small generic building blocks (`Panel` surface variants, `Badge`,
  `Avatar`, `Card`, `DataFreshnessStatus`, `LiveClock` — see `ui/README.md`).
- `auth/` — login-screen components (e.g. `GoogleSignInButton`). Client
  components only talk to `lib/supabase/client.ts`; identity/personnel
  resolution stays server-side in `lib/auth`.
- `dashboard/` — the personal dashboard. Server Components by default;
  only genuinely interactive pieces are client components (`ShiftProgress`
  and the nav's active-route highlighting — the live clock moved to the
  shell's `ShellUtilityBar`/`ui/LiveClock`, so the dashboard's own `Header`
  never renders a second one). Everything renders the already-safe
  `PersonalScheduleReadModel` (`lib/readModels`) — never raw `Event`/
  `Person` objects, never re-parsed spreadsheet text.
- `schedule/` — the personal monthly shift calendar (`/schedule`). Server
  Components (`ScheduleHeader`, `MonthNav`) render the page chrome and
  month navigation as plain links — switching months is a normal
  server-rendered navigation, not client state. `ScheduleCalendar` is the
  one client component (day-selection state only); it never receives the
  full `PersonalScheduleReadModel`, only the displayed month's already-safe
  `shiftCalendarEvents` and presentation-safe per-day metadata (`DayMeta`)
  computed server-side — so `@hebcal/core` (used to build that metadata)
  never ships to the client bundle.

- `pwa/` — `ServiceWorkerManager.tsx` (registers `/sw.js` once at the
  application root, drives the user-controlled "new version available"
  banner) and `UpdateNotice.tsx` (the banner itself). See `lib/pwa/README`
  for the full PWA foundation this belongs to. Mounted once in
  `app/layout.tsx`, never per-page.

Feature-specific components (duties, conflicts, ...) get their own
subfolder once those modules exist. Components render data handed to them
by `lib/domain`/`lib/readModels` — they never parse raw spreadsheet cells.
