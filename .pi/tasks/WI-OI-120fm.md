# WI-OI-120fm (F1.2 / E1): Finance journal drafts on `@gigalibs/document-lifecycle`

- **Status:** Done (2026-10-18; finance adapter tests 49/49)
- **Work item:** WI-OI-120 (F1 / E1). Evidence in `.pi/work/WI-OI-120.md`.
- **Size:** M

## Goal

Manual journal draft **submit**, **approve** and **returnToDraft** use the shared lifecycle runner; behaviour
unchanged (balance rules, second-person approval, period lock on submit and approve, post in same transaction).

## Scope

- **May change:** `modules/financial-operations/apps/api` (journal drafts service + lifecycle helper), finance API
  `package.json`, document-lifecycle if small hooks are needed.
- **Must not change:** CMMS, UAT deploy, applied migrations, CMMS import/export.

## Done when

- [x] Submit / approve / return go through `DocumentLifecycleRunner` with an explicit graph.
- [x] Existing finance tests pass; `pnpm --filter @gigalibs/financial-operations-api build` passes.
- [ ] F1.1 + F1.2 evidence noted in `.pi/work/WI-OI-120.md` (owner deploy not required for this slice).
