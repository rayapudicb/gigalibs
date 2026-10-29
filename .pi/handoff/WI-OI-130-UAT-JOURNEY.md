# WI-OI-130 MaaS IoT — path to **Done** (100%)

**Built** (Phase 1) is already recorded in [WORK_ITEMS.md](../WORK_ITEMS.md). **Done** requires your UAT acceptance (plan v3 §2 checklist on production/UAT), then updating the tracker row.

## Pre-flight (release worktree recommended)

```bash
pnpm install
pnpm modules:catalog
infra/compose/scripts/generate-module-runtime-credentials.sh iot-gateway   # if .env.module.iot-gateway missing
infra/compose/scripts/build-module-images.sh                             # includes iot-api
# Merge IoT relay keys into .env.modules (CMMS + Analytics) per modules/iot-gateway/README.md
```

Deploy from **release worktree** only (owner rule). Overlay: `infra/compose/compose.modules.local.yaml` (`iot-migrations` → `iot-api` :4250).

## UAT journey (accept when all pass)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Workflow → **IoT** → Devices → create device | Device row + one-time credential shown |
| 2 | POST ingest with device HMAC (`/api/iot/v1/ingest/...`) | 200; raw telemetry stored |
| 3 | Bind sensor to CMMS **meter** (`bind-meter`) | Binding persisted |
| 4 | Ingest reading above rule threshold | Alert; CRITICAL may open CMMS **downtime** via relay |
| 5 | CMMS asset **Downtime** tab | Active downtime visible; end downtime works |
| 6 | Analytics downtime fact (if relay configured) | Inbox/staging receives CMMS downtime event |

## Verification before you sign off

```bash
pnpm --filter @gigalibs/iot-api test
# Optional PG: IOT_PG_TEST_URL=postgresql://... pnpm --filter @gigalibs/iot-api test iot.pg.integration
pnpm verify   # full platform; note pre-existing baseline failures in NOW.md if any remain
```

IoT is a **standalone service module** (not `module:new` host catalog entry); `pnpm module:conformance iot-gateway` does not apply unless `spec.runtime.generated` is added later.

## Owner acceptance (required for **Done**)

When the journey passes on UAT, record acceptance (date + journey id) and set:

- `.pi/WORK_ITEMS.md` **WI-OI-130** → **Done**
- `.pi/tasks/WI-OI-130.md` → **Done** with acceptance note
- `.pi/NOW.md` → IoT closed or next item

Then say **commit** if you want the acceptance docs committed (implementation commit may already exist).

## Explicitly out of scope for WI-OI-130 (not blocking Done on this card)

- Production protocol daemons (Modbus/MQTT edge agents)
- Live network discovery beyond stub API
- Full Connector Hub parity (EAM WI-EAM-004 replaced scope)
