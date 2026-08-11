# lib/parsers

Turns raw rows/cells from `lib/google` into typed domain objects (personnel,
shifts, duties, duty blocks). No business rules, no direct UI usage. The UI
must never read raw spreadsheet cells — it only sees output from here.
