# WI-OI-124: Material and Warehouse Ledger

- **Status:** Approved (owner, 2026-10-28); queued after F0 and WI-OI-123
- **Work item:** WI-OI-124; evidence in `.pi/work/WI-OI-124.md`.
- **Size:** L

## Goal

Complete Module 2, Material and Warehouse Ledger, from `docs/plans/idempiere-parity-modules-plan.md` through real persisted journeys. Build and commit the full module before starting the next; owner deploys the seven-module batch once after all builds.

## Scope

- **May change:** `modules/universal-inventory`, stock/cost contracts, dictionary, tests and additive migrations.
- **Must not change:** CMMS import/export, another agent's work, secrets, or the web on port 5180.

## Read first

The matching module section of the parity plan; `.pi/PLAN.md`, requirements baseline, SDLC and completeness standards; ADR-0018, ADR-0033, ADR-0007; affected contracts and migrations.

## Steps

1. Add locators, lot/serial, reservation and immutable transaction/cost records with safe migration from current stock grain.
2. Implement exact ATP, atomic reserve/release, costing configuration, gateway commands and Finance facts.
3. Publish warehouse map, scanner drawer, reservation/ledger windows and live ATP; prove concurrent reservation and reversal.

## Done when

- [ ] Every named slice, screen, handshake and key failure path in the plan works with real persistence and authorized scope.
- [ ] Migration verification, roll-forward, audit, relay replay and E2E evidence are recorded.
- [ ] `pnpm verify` passes with no new failures; module-completion commit is made; registry and NOW are updated.

## Stop and ask if

A decision is not settled by the owner or accepted ADRs, or a step would change a running service or owner data.

## Report

What was built, verification, deploy-sequence position and next module in at most five bullets.

