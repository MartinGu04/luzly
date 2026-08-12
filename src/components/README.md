# components

- `layout/` — app shell, right-side desktop `Sidebar`, mobile `BottomNav`
  (replacing the old hamburger/drawer), `IdentityFooter`.
- `ui/` — small generic building blocks (`Panel` surface variants, `Badge`,
  `Avatar`, `Card`).
- `auth/` — login-screen components (e.g. `GoogleSignInButton`). Client
  components only talk to `lib/supabase/client.ts`; identity/personnel
  resolution stays server-side in `lib/auth`.
- `dashboard/` — the personal dashboard. Server Components by default;
  only genuinely interactive pieces are client components (`LiveClock`,
  `ShiftProgress`, and the nav's active-route highlighting). Everything
  renders the already-safe `PersonalScheduleReadModel` (`lib/readModels`)
  — never raw `Event`/`Person` objects, never re-parsed spreadsheet text.

Feature-specific components (schedule, duties, conflicts, ...) get their
own subfolder once those modules exist. Components render data handed to
them by `lib/domain`/`lib/readModels` — they never parse raw spreadsheet
cells.
