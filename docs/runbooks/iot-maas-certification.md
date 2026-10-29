# IoT MaaS certification runbook (WI-OI-130)

Certifies the **HTTP + outbox relay** path (not edge MQTT/Modbus). Use an **isolated** PostgreSQL tenant; never
attach simulators to production UAT customer tenants without owner approval.

## Prerequisites

1. Release worktree at a commit that includes `modules/iot-gateway` and CMMS downtime migration **23+**.
2. Compose overlay `infra/compose/compose.modules.local.yaml` with `iot-migrations` → `iot-api` (:4250).
3. Web on **5180** rebuilt with IoT routes (`/iot/*`).
4. Relay keys: `generate-module-runtime-credentials.sh`, IoT → CMMS URLs in `.env.modules`.

## Automated checks (agent/CI)

| Step | Command |
|------|---------|
| Unit | `pnpm --filter @gigalibs/iot-api test` |
| Platform verify | `pnpm verify` (after equivalence + deployment profile fixes) |
| UI smoke | `cd e2e && source load-uat-env.sh && playwright test specs/iot-maas-ui.spec.ts` |
| Ingest (optional) | Set `IOT_E2E_DEVICE_ID`, `IOT_E2E_DEVICE_CREDENTIAL`, `IOT_E2E_API_URL`; run `specs/iot-maas-ingest.spec.ts` |

## Scenario catalog

Scenario files live under `e2e/scenarios/iot-maas/`. Start with:

- **`sim-cnc-vibration-wo-downtime-analytics.yaml`** — healthy → breach → recovery; asserts downtime, optional WO, analytics fact.

Orchestration (future CLI): read YAML → provision CMMS asset/meter/trigger → IoT device/rule/bind-meter → replay timeline via `e2e/helpers/iot-ingest.ts` → SQL/API asserts.

## Data layers (taxonomy)

| Layer | Purpose | Canonical enums |
|-------|---------|-----------------|
| Telemetry | Raw signal | channel, metric_type, quality (simulator) |
| Alert | Rule outcome | WARNING, CRITICAL |
| Downtime | Availability | PLANNED / UNPLANNED / PROCESS; source MANUAL / IOT_AUTO / WORKFLOW |
| Work order | Corrective action | CMMS meter triggers (THRESHOLD_BREACH, USAGE_INTERVAL) |
| Analytics fact | Reporting grain | `downtime_facts` from `cmms.downtime.v1` inbox |

**Industry codes:** use **EAM asset classification** (e.g. `CNC_MACHINING`) and **failure_cause_code** on downtime—not NAICS at the edge. Tenant **industry packs** (`solutions/packs/industry/*.yaml`) configure UI/templates only.

## Owner UAT → Done

When the journey in `.pi/handoff/WI-OI-130-UAT-JOURNEY.md` passes on UAT, record acceptance and set **WI-OI-130** to **Done** in `.pi/WORK_ITEMS.md`. Security review on UAT follows plan v3 (non-blocking for other builds).

## Explicitly out of scope here

- Live message broker (Kafka/NATS) — today: PostgreSQL outbox + relay pollers
- Protocol daemons and network discovery beyond stub APIs
- Marking WI-OI-130 Done from Playwright alone (owner acceptance required)
