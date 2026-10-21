# WI-OI-120hi: Compose DATABASE_URL probe (M-AR0 unblock)

- **Status:** Built (2026-10-19)
- **Work item:** Unblocks [WI-OI-120gf](WI-OI-120gf.md) when `.env` credentials drift from dev Postgres.

## Goal

Host-side check explains `28P01` / connection failures before AR rebuild; `proof:ar-compose-rebuild` uses it.

## Done when

- [x] `verify-compose-database-url.mjs` + `pnpm audit:compose-database-url`
- [x] README troubleshooting for control migrations / AR rebuild
- [x] Main worktree probes `.env.test` + port **5441**; release worktree still uses `.env` + **5440** (2026-10-21)
