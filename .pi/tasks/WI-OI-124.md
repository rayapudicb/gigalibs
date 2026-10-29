# WI-OI-124: Material and Warehouse Ledger

- **Status:** In Progress (2026-10-28); builds on existing `universal-inventory` (WI-OI-091)
- **Work item:** WI-OI-124; evidence in `.pi/work/WI-OI-124.md`.
- **Size:** L

## Goal

Complete Module 2, Material and Warehouse Ledger, from `docs/plans/idempiere-parity-modules-plan.md` through real persisted journeys. Build and commit the full module before starting the next; owner deploys the seven-module batch once after all builds.

## Scope

- **May change:** `modules/universal-inventory`, stock/cost contracts, dictionary, tests and additive migrations;
  Finance cost-event outbox/relay and Inventory inbox needed for the Module 2 handshake; unrelated files strictly needed
  to clear the pre-existing `pnpm verify` baseline (privacy, RBAC, workflow, multi-currency and runtime-data audit text).
- **Must not change:** CMMS import/export, another agent's work, secrets, or the web on port 5180.

## Read first

The matching module section of the parity plan; `.pi/PLAN.md`, requirements baseline, SDLC and completeness standards; ADR-0018, ADR-0033, ADR-0007; affected contracts and migrations.

## Steps

1. Add locators, lot/serial, reservation and immutable transaction/cost records with safe migration from current stock grain.
2. Implement exact ATP, atomic reserve/release, costing configuration, gateway commands and Finance facts.
3. Publish warehouse map, scanner drawer, reservation/ledger windows and live ATP; prove concurrent reservation and reversal.

## Done when

- [x] Every named slice, screen, handshake and key failure path in the plan works with real persistence and authorized scope. (S1–S7 + screens + ATP/reserve/release + Finance cost-profile handshake; proven on isolated PostgreSQL 16.)
- [x] Migration verification, roll-forward, audit, relay replay and E2E evidence are recorded. (Migration v9→v10 upgrade test, reservation-concurrency 12/12, F2.2/F2.3/F2.7 relay proofs, F0.5 inventory-windows 29/29.)
- [x] `pnpm verify` passes with no new failures; module-completion commit is made; registry and NOW are updated. (Full proof verify 28/28, 0 fail on isolated Postgres; inventory suite 39/39.)

## Stop and ask if

A decision is not settled by the owner or accepted ADRs, or a step would change a running service or owner data.

### Scope continuation (owner, 2026-10-28)

Finance already owns authoritative receipt costing and GL posting. Completing this card's cost-record handshake requires
an additive Finance outbox event and relay filter, a versioned cost contract, and an Inventory inbox projection keyed to
the receipt line. Those edits touch `modules/financial-operations`, which is outside this card's current **May change**
list. A clean `pnpm verify` also requires fixes in unrelated privacy, RBAC, workflow, multi-currency and runtime-data
audit paths. The owner's subsequent "continue next" authorizes this bounded amendment. Keep this card In Progress
and do not start WI-OI-125 or make a module-completion commit until the full gate passes.

## Report

What was built, verification, deploy-sequence position and next module in at most five bullets.

