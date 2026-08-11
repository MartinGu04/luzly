# components

- `layout/` — app shell, sidebar, mobile navigation.
- `ui/` — small generic building blocks (e.g. `Card`).

Feature-specific components (schedule, duties, conflicts, ...) get their
own subfolder once those modules exist. Components render data handed to
them by `lib/domain` — they never parse raw spreadsheet cells.
