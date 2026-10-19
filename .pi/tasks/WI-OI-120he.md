# WI-OI-120he: Module-local compose env wiring (M-AR0)

- **Status:** Built (2026-10-19)
- **Work item:** Parent [WI-OI-120gf](WI-OI-120gf.md) — `docker compose up ar-api` failed without Workforce/Geospatial env files.

## Goal

Scripts that touch `compose.modules.local.yaml` load `.env`, `.env.modules`, `.env.workforce`, and `.env.geospatial` so kernel-worker interpolation succeeds.

## Done when

- [x] `compose-modules-local.sh` + `up-ar-api.sh`
- [x] `verify-ar-compose-health.sh` uses shared compose args
- [x] README documents the four env files
- [ ] Local: `up-ar-api.sh` + `pnpm proof:ar-compose-health` (when image rebuilt)
