# WI-OI-130: MaaS IoT Gateway & downtime analytics foundation

- **Status:** Built — **Done** requires owner UAT acceptance ([handoff](../handoff/WI-OI-130-UAT-JOURNEY.md))
- **Work item:** WI-OI-130
- **Size:** L

## Goal

Deliver the MaaS platform slice: IoT Gateway module (devices, ingest, alerts, UI), CMMS downtime capture with broker facts, telemetry condition operators, and analytics downtime template seeds (availability-first).

## Scope

- **May change:** `modules/iot-gateway/**`, CMMS downtime API/migration/UI, `packages/rule-engine-universal`, `modules/analytics-studio/apps/api/src/seeds/**`, generated catalog after `pnpm modules:catalog`.
- **Must not change:** WI-OI-125 inventory transfer work; CMMS import/export frozen files; secrets.

## Done when (100%)

### Phase 1 — BUILD (agent)

- [x] IoT API + migrations v4 + workflow routes; CMMS downtime; telemetry operators; analytics seeds/worker tests
- [x] CMMS ↔ IoT ↔ Analytics relays wired in code; compose `iot-api`
- [x] Evidence [`.pi/work/WI-OI-130.md`](../work/WI-OI-130.md)
- [ ] **Full `pnpm verify` clean** on release worktree (owner/agent run; fix only IoT regressions)

### Phase 2 — UAT (owner)

- [ ] Deploy from release worktree with journey in [WI-OI-130-UAT-JOURNEY.md](../handoff/WI-OI-130-UAT-JOURNEY.md)
- [ ] Owner records acceptance (date + journey reference) → tracker **Done**

### Phase 3 — REVIEW (owner, non-blocking for next build)

- [ ] Independent Security review on UAT after deploy
