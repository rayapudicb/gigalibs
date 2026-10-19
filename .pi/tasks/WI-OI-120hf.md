# WI-OI-120hf: AR compose rebuild orchestration (M-AR0)

- **Status:** Built (2026-10-19; health proof blocked on local Postgres)
- **Work item:** Parent [WI-OI-120gf](WI-OI-120gf.md)

## Goal

`refresh-source-identity` keeps `AR_IMAGE` in sync; one script rebuilds migrations + `ar-api` and runs `proof:ar-compose-health`.

## Done when

- [x] `AR_IMAGE` updated in `refresh-source-identity.sh`
- [x] `rebuild-ar-compose-local.sh` + root `pnpm proof:ar-compose-rebuild`
- [ ] `pnpm proof:ar-compose-health` passes (blocked here: control `migrations` → `Connection terminated unexpectedly`)
