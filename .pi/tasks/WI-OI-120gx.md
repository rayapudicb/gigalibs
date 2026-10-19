# WI-OI-120gx: AR API on module-runtime compose (M-AR0 slice)

- **Status:** Built (2026-10-19; not on UAT)
- **Work item:** Parent [WI-OI-120gf](WI-OI-120gf.md) — standalone OIDC AR service on local compose (module SDK port deferred).

## Goal

`ar-migrations` + `ar-api` run in `compose.modules.local.yaml`; web BFF reaches `http://ar-api:3400`.

## Done when

- [x] `db/runtime-manifest.txt` (migration **14**)
- [x] Docker `ar-api` target + `build-module-images.sh`
- [x] `.env.modules` generator adds `AR_IMAGE` / `AR_DATABASE_URL`
- [x] BFF allows `ar-api` upstream host
- [ ] Owner: rebuild module images and `docker compose up` (optional local evidence)

## Run (owner)

```bash
infra/compose/scripts/generate-module-runtime-credentials.sh  # if AR_* missing from .env.modules
infra/compose/scripts/build-module-images.sh
docker compose -f infra/compose/compose.yaml -f infra/compose/compose.modules.local.yaml --env-file infra/compose/.env --env-file infra/compose/.env.modules up -d ar-api
```
