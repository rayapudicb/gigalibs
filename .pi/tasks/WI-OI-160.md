# WI-OI-160: Relay wiring generated from manifests

- **Status:** Approved (owner, 2026-11-03, execution plan approval). Phase 0; can start now.
- **Work item:** WI-OI-160. Evidence goes in `.pi/work/WI-OI-160.md`.
- **Size:** M. **Decisions:** ADR-0039 §5.

## Goal

Which service sends which events to which module is declared in the manifests and the settings are generated, so a relay
can never again be configured on the wrong service (QA-046: parties were never relayed because the keys sat elsewhere).

## Scope

- **May change:** `spec.relays` in `modules/*/module.yaml` and the kernel registry; a generator
  (`scripts/relay-wiring.mjs` or inside `scripts/module-manifests.mjs`); generated environment blocks in
  `infra/compose/compose*.yaml`, `config/deployment-profiles/*.json` optional environment, `infra/compose/.env.example`
  (variable names only); `packages/module-sdk/src/relay-config.ts`; an `audit:relays` step in `pnpm verify`; tests.
- **Must not change:** secret values; the release worktree's compose files. Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

ADR-0039; `packages/module-sdk/src/relay-config.ts`, `relay-health.ts`; the party relay settings added in `f0035ec5`
(`BUSINESS_PARTNERS_RELAY_URL`, `BUSINESS_PARTNERS_INBOX_RELAY_PRIVATE_KEY_BASE64` on the api service); the organization
replica relays.

## Steps

1. `spec.relays`: events produced, consumers, inbox path, key variable names.
2. Generator writes each service's relay variables into compose, the deployment profile and `.env.example`.
3. `audit:relays`: every consumed event has a producer whose relay variables sit on the producing service; fails on drift.
4. Relay health per pair exposed for the hub (WI-OI-152).

## Done when

- [ ] Regenerating reproduces today's party and organization relay settings exactly (no diff)
- [ ] A test proves `audit:relays` fails when a key is placed on the wrong service
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-160.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- generated settings differ from what runs on UAT today.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
