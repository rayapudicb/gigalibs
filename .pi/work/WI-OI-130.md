# WI-OI-130 evidence (2026-10-29)

## Built in this slice

- New `modules/iot-gateway`: PostgreSQL schema + RLS, Nest API (devices, dashboard, ingest/HMAC, alerts, rules, protocols stub, discovery stub), workflow pages via `@gigalibs/iot-web`.
- CMMS migration `000023_asset_downtime_maasa` recreates `asset_downtimes` and adds source/external alert/work-order fields; REST start/end/list; asset **Downtime** tab.
- `@gigalibs/rule-engine-universal` telemetry operators + unit tests.
- Analytics Studio seed constants for downtime dashboard (availability-first).

## Update (2026-10-29, continue)

- Ingest path evaluates IoT condition rules inline (alerts + `telemetry.alert.v1` outbox).
- Bound sensors queue `iot.meter_readings.v1` outbox payloads for CMMS relay (no cross-schema SQL).
- `POST v1/devices/:id/bind-meter` for confirmed meter bindings.
- `spec.runtime` host entry for module-host; analytics downtime fact worker stub.

## Update (2026-10-29, completion pass)

- Migration `000004` outbox relay + `IotCmmsRelayService` (meter batch + CRITICAL alert → downtime start).
- Compose/Docker `iot-api` final stage + credential generator; CMMS migration **v24** (`000024` analytics downtime relay).
- `CmmsAnalyticsDowntimeRelay` → Analytics inbox (`receiveCmmsDowntime` + `projectDowntimeFact` raw staging).
- Workflow JSON `modules/iot-gateway/docs/iot-alert-downtime-workflow.json`; module README; `database.service` decorator fix.
- Opt-in PG migration test `iot.pg.integration.test.ts`; analytics seeds + worker spec.
- Evidence: `pnpm modules:catalog` 0 errors; `@gigalibs/iot-api`, CMMS API, Analytics API typecheck pass; targeted vitest 3/3.

## Path to **Done** (100%)

1. **BUILD** — complete in tracker (**Built**). Remaining: clean **`pnpm verify`** on release worktree (fix IoT-only regressions if any).
2. **UAT** — owner runs [`.pi/handoff/WI-OI-130-UAT-JOURNEY.md`](../handoff/WI-OI-130-UAT-JOURNEY.md) and records acceptance → **Done** in WORK_ITEMS.
3. **REVIEW** — Security on UAT (post-deploy, non-blocking for other work).

`pnpm module:conformance iot-gateway` is **not** the gate (IoT is a standalone service module, not `spec.runtime.generated` host catalog).

## Owner verify

- Rebuild module images (`build-module-images.sh`), refresh `.env.modules` IoT keys, bring stack up, journey: provision device → ingest → bind meter → rule breach → CMMS reading/downtime.
- `pnpm verify` (expect only known repo baseline failures until full green run).
