# WI-OI-120gf: Accounts Receivable on configuration-local profile (M-AR0)

- **Status:** Built (2026-10-21, local `gigalibs-test`) — `pnpm proof:ar-compose-health` OK; compose probe uses `.env.test` on main
- **Work item:** Table 1 rows 7–8. Evidence in `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** L

## Goal

`accounts-receivable` runs on local compose with module SDK boundary tests; AR invoice UI uses metadata (120bj zero-mock already on web).

## Scope

- **May change:** `modules/accounts-receivable`, compose generated overlays, deployment profile allow-list.
- **Must not change:** CMMS import/export; secrets.

## Done when

- [x] Service healthy on local profile (`gigalibs-test`, mig **16**, `proof:ar-compose-health` 2026-10-21)
- [x] Root `pnpm build` + `pnpm test` pass ([WI-OI-120hc](WI-OI-120hc.md) fixes)
- [x] No fake verification UI (120bj) on `/ar` — metadata workspace ([WI-OI-120ha](WI-OI-120ha.md)); aging route still uses live `requestAr`

## Stop and ask if

- Compose profile change affects owner UAT release worktree without migration plan.
