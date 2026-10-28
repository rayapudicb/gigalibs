# WI-OI-128: Returns and RMA

- **Status:** Approved (owner, 2026-10-28); queued after WI-OI-124 and Orders/AR invoice and credit-memo contracts
- **Work item:** WI-OI-128; evidence in `.pi/work/WI-OI-128.md`.
- **Size:** L

## Goal

Complete Module 6, Returns and RMA, from `docs/plans/idempiere-parity-modules-plan.md` through real persisted journeys. Build and commit the full module before starting the next; owner deploys the seven-module batch once after all builds.

## Scope

- **May change:** `modules/universal-returns`, return/credit contracts, dictionary, tests and module-owned migrations.
- **Must not change:** CMMS import/export, another agent's work, secrets, or the web on port 5180.

## Read first

The matching module section of the parity plan; `.pi/PLAN.md`, requirements baseline, SDLC and completeness standards; ADR-0018, ADR-0033, ADR-0007; affected contracts and migrations.

## Steps

1. Build RMA and line persistence with anti-fraud returned-quantity guard and document actions; reconcile existing Orders `customer_returns` so one physical return has one owner.
2. Implement restock/quarantine/scrap inventory effects, GL posting and AR credit-memo handshake with durable recovery.
3. Publish processing checklist, evidence capture and credit-memo action; prove damaged partial return end to end.

## Done when

- [ ] Every named slice, screen, handshake and key failure path in the plan works with real persistence and authorized scope.
- [ ] Migration verification, roll-forward, audit, relay replay and E2E evidence are recorded.
- [ ] `pnpm verify` passes with no new failures; module-completion commit is made; registry and NOW are updated.

## Stop and ask if

A decision is not settled by the owner or accepted ADRs, or a step would change a running service or owner data.

## Report

What was built, verification, deploy-sequence position and next module in at most five bullets.

