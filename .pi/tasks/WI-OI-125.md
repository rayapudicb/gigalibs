# WI-OI-125: Advanced SCM and Transfers

- **Status:** Built (pending owner verify + UAT)
- **Work item:** WI-OI-125; evidence in `.pi/work/WI-OI-125.md`.
- **Size:** L

## Goal

Complete Module 3, Advanced SCM and Transfers, from `docs/plans/idempiere-parity-modules-plan.md` through real persisted journeys. Build and commit the full module before starting the next; owner deploys the seven-module batch once after all builds.

## Scope

- **May change:** `modules/universal-inventory`, transfer/replenishment contracts, dictionary, tests and additive migrations.
- **Must not change:** CMMS import/export, another agent's work, secrets, or the web on port 5180.

## Read first

The matching module section of the parity plan; `.pi/PLAN.md`, requirements baseline, SDLC and completeness standards; ADR-0018, ADR-0033, ADR-0007; affected contracts and migrations.

## Steps

1. Build transfer document actions with source, in-transit and destination ledger movements and recovery.
2. Add versioned min-max/pack rules, bulk PO draft handshake, idempotency and GL clearance posting status.
3. Publish transfer board and replenishment radar; prove receipt makes stock sellable and replay cannot duplicate it.

## Done when

- [x] Every named slice, screen, handshake and key failure path in the plan works with real persistence and authorized scope.
- [x] Migration verification, roll-forward, audit, relay replay and E2E evidence are recorded (see `.pi/work/WI-OI-125.md`).
- [ ] `pnpm verify` passes with no new failures; module-completion commit is made; registry and NOW are updated.

## Stop and ask if

A decision is not settled by the owner or accepted ADRs, or a step would change a running service or owner data.

## Report

What was built, verification, deploy-sequence position and next module in at most five bullets.

