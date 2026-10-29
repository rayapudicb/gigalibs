# IoT Gateway (MaaS)

NestJS API (`@gigalibs/iot-api`), React workspace (`@gigalibs/iot-web`), PostgreSQL schema `gigalibs_iot`.

## Local stack

1. Build images: `infra/compose/scripts/build-module-images.sh` (includes `iot-api`).
2. Ensure `infra/compose/.env.modules` has `IOT_*` from `generate-module-runtime-credentials.sh`.
3. Compose overlay: `compose.modules.local.yaml` runs `iot-migrations` then `iot-api` on port **4250**.

## Journey (UAT)

1. Open **IoT** in the workflow app; provision a device and sensor.
2. POST telemetry to IoT ingest (device credential + HMAC headers).
3. Bind sensor to a CMMS meter; confirm relay posts meter readings.
4. Create a threshold rule; breach → alert; CRITICAL auto-starts CMMS asset downtime via relay.

## Tests

- Unit: `pnpm --filter @gigalibs/iot-api test`
- Migrations (opt-in): `IOT_PG_TEST_URL=postgresql://... pnpm --filter @gigalibs/iot-api test iot.pg.integration`

Work item: **WI-OI-130**.
