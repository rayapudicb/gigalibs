# WI-OI-120hd: AR compose health proof (M-AR0)

- **Status:** Built (2026-10-19; local evidence when owner runs compose)
- **Work item:** Parent [WI-OI-120gf](WI-OI-120gf.md) — close compose rebuild after mig **16**.

## Goal

Repeatable script proves `ar-api` is healthy on the configuration-local profile after `ar-migrations` reaches version **16**.

## Done when

- [x] `infra/compose/scripts/verify-ar-compose-health.sh` probes in-container `/health/ready` and pin **16**
- [x] `runtime-manifest.txt` header documents expected version **16**
- [ ] Owner: rebuild AR image + `up -d ar-api`, run `pnpm proof:ar-compose-health` (optional evidence)

## Run (owner / local compose)

```bash
infra/compose/scripts/refresh-source-identity.sh   # if build-module-images complains
infra/compose/scripts/build-module-images.sh         # builds gigalibs/ar-api tag
pnpm proof:ar-compose-rebuild                        # identity + images + up + health
# Or stepwise: up-ar-api.sh then proof:ar-compose-health
```
