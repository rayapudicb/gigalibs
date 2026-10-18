# WI-OI-120gf: Accounts Receivable on configuration-local profile (M-AR0)

- **Status:** Blocked (M-AR0 / WI-OI-120aj E1a — API excluded from default build; see `modules/accounts-receivable/module.yaml`)
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
