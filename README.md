# מי-מה-מו (mi-ma-mo)

מי-מה-מו is a Hebrew RTL, read-only scheduling companion built on top of an
existing Google Sheets scheduling workbook. Google Sheets remains the
single source of truth; מי-מה-מו never writes back to it.

This repository currently contains the **project foundation** only:
Next.js App Router shell, Hebrew/RTL layout, and placeholder architecture
for the modules described in `CLAUDE.md`. No Google Sheets integration,
auth, or real scheduling data yet.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Vitest · ESLint

## Scripts

```bash
npm run dev         # start the dev server
npm run build        # production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest
```

## Project layout

```
src/app/          Next.js routes
src/components/   UI (layout shell, generic building blocks)
src/lib/google/   Google Sheets API access (not implemented)
src/lib/parsers/  raw sheet data -> typed domain objects (not implemented)
src/lib/domain/   scheduling business rules (not implemented)
src/lib/sync/     sync/update status, caching (not implemented)
src/lib/auth/     authentication & permissions (not implemented)
```

See `CLAUDE.md` for the permanent engineering rules.
