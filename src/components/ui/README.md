# components/ui

Small, generic building blocks reused across feature areas: `Panel`
surface variants, `Badge`, `Avatar`, `Card`, `CoverageBadge`,
`IssueSeverityBadge`, `LiveClock`.

- `LiveClock.tsx` — the one live Asia/Jerusalem clock in the app (Design
  Pass PR #19; previously dashboard-only). Its only current caller is
  `layout/ShellUtilityBar.tsx` (the app shell's desktop-only top utility
  row), so it never appears twice on one page. Presentation-only: it never
  makes a network request and is never a source of scheduling truth (the
  read model's `LocalNow` remains that). `initialTime` is `null` when no
  server-derived value is available (e.g. a `configuration_error` shell
  render) — the component renders nothing until its own first client-side
  tick, which stays hydration-safe by construction.

## Data freshness + manual refresh (PR #17)

מי-מה-מו does not replace Google Sheets. Google Sheets stays the working
surface and the source of truth; מי-מה-מו is a **read-only** visibility
layer that fetches timestamped snapshots of it (`lib/google` — every
sheet read is `spreadsheets.values.batchGet`, never a write). Every read
model already carries its own `fetchedAt` (an ISO instant) recording
**when מי-מה-מו fetched that snapshot** — never when someone last edited
the spreadsheet, and there is no separate "last modified in Sheets"
timestamp anywhere in this codebase.

- `DataFreshnessStatus.tsx` — the one shared, restrained "how fresh is
  what I'm looking at" metadata row, placed near/below each page's own
  header (never inside it — no header redesign) on every route that
  renders a read model: `/`, `/schedule`, `/duties`
  (all `PersonalScheduleReadModel.fetchedAt`), `/manager`
  (`ManagerOverviewReadModel.fetchedAt` — even on the selected-person
  sub-view, never the nested personal `fetchedAt` from that person's own
  `PersonalScheduleReadModel`), and `/manager/fairness`
  (`ManagerFairnessReadModel.fetchedAt`). It receives ONLY that one
  `fetchedAt` string prop — never a raw Google timestamp, workbook
  ranges, `sourceSheet`/`sourceCell`, the spreadsheet id, or personnel
  emails.
  - The relative-age text ("עודכן עכשיו" / "עודכן לפני 4 דקות") comes
    from `lib/presentation/dataFreshness.ts`'s pure
    `formatDataFreshnessLabel(fetchedAt, now)`, called ONLY inside a
    `useEffect` (i.e. strictly after mount) so server-rendered output and
    the browser's own clock never both render in the same pass —
    `label` starts `null` (matching exactly what the server rendered),
    avoiding any hydration mismatch. A local 30s timer re-ticks that
    DISPLAYED text only; it never triggers a network request — there is
    no automatic polling anywhere in this component.
  - The refresh control calls `router.refresh()` (wrapped in
    `useTransition` for a pending/spinner state) to rerun the CURRENT
    route's existing Server Component data loader — no new API route, no
    direct browser call to Google, no separate fetch implementation, and
    no writeback. `router.refresh()` preserves the route's own URL/query
    state (e.g. `?month=`, `?person=&range=`, `?period=`) — it is not a
    navigation. A user clicking refresh is the ONLY thing that causes an
    extra Google read; normal page loads/renders never gain an additional
    fetch just because this component exists. Once a genuinely new
    `fetchedAt` prop arrives from a real refreshed snapshot, the relative
    age naturally resets to "עודכן עכשיו" — that IS the success signal;
    there is no separate fake "הרענון הצליח" state shown before a new
    model has actually arrived.
