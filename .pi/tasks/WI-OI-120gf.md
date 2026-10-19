# WI-OI-120gf: Accounts Receivable on configuration-local profile (M-AR0)

- **Status:** In progress — compose + platform auth + manifest BFF in [WI-OI-120gx](WI-OI-120gx.md)–[WI-OI-120gz](WI-OI-120gz.md); module-host / `ModuleDatabase` / metadata windows remain
- **Work item:** Table 1 rows 7–8. Evidence in `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** L

## Goal

`accounts-receivable` runs on local compose with module SDK boundary tests; AR invoice UI uses metadata (120bj zero-mock already on web).

## Scope

- **May change:** `modules/accounts-receivable`, compose generated overlays, deployment profile allow-list.
- **Must not change:** CMMS import/export; secrets.

## Done when

- [ ] Service healthy on local profile; `pnpm verify` passes
- [ ] No fake verification UI (120bj)

## Stop and ask if

- Compose profile change affects owner UAT release worktree without migration plan.
