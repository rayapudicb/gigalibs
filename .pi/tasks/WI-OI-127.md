# WI-OI-127: Landed Cost Allocation

- **Status:** Approved (owner, 2026-10-28); queued after WI-OI-124, WI-OI-125 and the Procurement receipt/bill contract
- **Work item:** WI-OI-127; evidence in `.pi/work/WI-OI-127.md`.
- **Size:** L

## Goal

Complete Module 5, Landed Cost Allocation, from `docs/plans/idempiere-parity-modules-plan.md` through real persisted journeys. Build and commit the full module before starting the next; owner deploys the seven-module batch once after all builds.

## Scope

- **May change:** `modules/universal-procurement`, `modules/financial-operations` adapters, allocation contracts, dictionary, tests and migrations.
- **Must not change:** CMMS import/export, another agent's work, secrets, or the web on port 5180.

## Read first

The matching module section of the parity plan; `.pi/PLAN.md`, requirements baseline, SDLC and completeness standards; ADR-0018, ADR-0033, ADR-0007; affected contracts and migrations.

## Steps

1. Build landed-cost documents and exact quantity/value/weight/volume allocation with rounding reconciliation.
2. Implement cost true-up, sold-goods variance posting, idempotent relay handling and recovery.
3. Publish allocation wizard and cost-impact panel; prove the $3,000/500-unit journey.

## Done when

- [ ] Every named slice, screen, handshake and key failure path in the plan works with real persistence and authorized scope.
- [ ] Migration verification, roll-forward, audit, relay replay and E2E evidence are recorded.
- [ ] `pnpm verify` passes with no new failures; module-completion commit is made; registry and NOW are updated.

## Stop and ask if

A decision is not settled by the owner or accepted ADRs, or a step would change a running service or owner data.

## Report

What was built, verification, deploy-sequence position and next module in at most five bullets.

