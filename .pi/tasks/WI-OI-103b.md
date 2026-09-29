# WI-OI-103b: formula measures with maker-checker

- **Status:** Done (2026-09-29). Built by the GPT agent, then reviewed, proved and closed by Claude. Evidence is in
  `.pi/work/WI-OI-103.md` under "103b".
- **Work item:** WI-OI-103.
- **Size:** M.

## Done

- [x] Typed formula contract; append-only versions and reviews with RLS (migration 000016).
- [x] Maker-checker: the approver differs from the creator; publishing has its own permission.
- [x] Queries use approved versions only; charts can pin a version; division by zero gives null.
- [x] 79 tests; migration and formula SQL proven on real PostgreSQL without leaving a trace; `pnpm verify` passes.
