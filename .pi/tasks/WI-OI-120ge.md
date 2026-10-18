# WI-OI-120ge: Local compose — Inventory Table 2 packages in Docker workspace

- **Status:** Built (local profile audit passes; 2026-10-19)
- **Work item:** Table 2 / Table 1 row 5. Evidence in `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** M

## Goal

`pnpm audit:configuration-deployment-profile` passes **WORKSPACE_DEPENDENCY_MISSING** for Inventory (`document-lifecycle`, `posting-rules`) so local module-host builds include Table 2 stack.

## Scope

- **May change:** Docker workspace manifest / compose profile inputs under `infra/compose`, `packages/document-lifecycle`, `packages/posting-rules` promotion from quarantine per `docs/runtime-quarantine.md`.
- **Must not change:** Applied UAT migrations; Finance→Inventory layer violations (separate card).

## Done when

- [x] Profile audit clean for inventory deps
- [x] `pnpm audit:configuration-deployment-profile` passes (2026-10-19)
- [x] Evidence in `.pi/work/TABLE-1-AUDIT-2026-10-19.md`

## Stop and ask if

- Promotion requires owner decision on quarantine policy.
