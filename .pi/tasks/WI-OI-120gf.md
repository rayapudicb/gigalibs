# WI-OI-120gf: Accounts Receivable on configuration-local profile (M-AR0)

- **Status:** In progress — [WI-OI-120ha](WI-OI-120ha.md) + [WI-OI-120hb](WI-OI-120hb.md) done; verify on local compose + optional module-host remain
- **Work item:** Table 1 rows 7–8. Evidence in `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** L

## Goal

`accounts-receivable` runs on local compose with module SDK boundary tests; AR invoice UI uses metadata (120bj zero-mock already on web).

## Scope

- **May change:** `modules/accounts-receivable`, compose generated overlays, deployment profile allow-list.
- **Must not change:** CMMS import/export; secrets.

## Done when

- [ ] Service healthy on local profile (owner compose rebuild after mig **16**)
- [x] Root `pnpm build` + `pnpm test` pass ([WI-OI-120hc](WI-OI-120hc.md) fixes)
- [ ] No fake verification UI (120bj) — `/ar` uses metadata ([WI-OI-120ha](WI-OI-120ha.md))

## Stop and ask if

- Compose profile change affects owner UAT release worktree without migration plan.
