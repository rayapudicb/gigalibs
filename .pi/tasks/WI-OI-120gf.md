# WI-OI-120gf: Accounts Receivable on configuration-local profile (M-AR0)

- **Status:** In progress — git complete through [WI-OI-120hd](WI-OI-120hd.md); owner compose rebuild + `pnpm proof:ar-compose-health` remain
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
- [x] No fake verification UI (120bj) on `/ar` — metadata workspace ([WI-OI-120ha](WI-OI-120ha.md)); aging route still uses live `requestAr`

## Stop and ask if

- Compose profile change affects owner UAT release worktree without migration plan.
