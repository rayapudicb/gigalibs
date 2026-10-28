# WI-OI-126: Manufacturing, BOM and MRP

- **Status:** Approved (owner, 2026-10-28); queued after WI-OI-124 and WI-OI-125
- **Work item:** WI-OI-126; evidence in `.pi/work/WI-OI-126.md`.
- **Size:** L

## Goal

Complete Module 4, Manufacturing, BOM and MRP, from `docs/plans/idempiere-parity-modules-plan.md` through real persisted journeys. Build and commit the full module before starting the next; owner deploys the seven-module batch once after all builds.

## Scope

- **May change:** `modules/universal-manufacturing`, manufacturing contracts, dictionary, tests and module-owned migrations.
- **Must not change:** CMMS import/export, another agent's work, secrets, or the web on port 5180.

## Read first

The matching module section of the parity plan; `.pi/PLAN.md`, requirements baseline, SDLC and completeness standards; ADR-0018, ADR-0033, ADR-0007; affected contracts and migrations.

## Steps

1. Build multi-level BOM, routings and production-order persistence with tenant RLS and organization ownership.
2. Implement exact BOM explosion, cost rollup, MRP netting and recoverable inventory reserve/issue/receive handshakes.
3. Publish BOM tree, MRP preview and execution cockpit; prove WIP/variance posting and run recovery.

## Done when

- [ ] Every named slice, screen, handshake and key failure path in the plan works with real persistence and authorized scope.
- [ ] Migration verification, roll-forward, audit, relay replay and E2E evidence are recorded.
- [ ] `pnpm verify` passes with no new failures; module-completion commit is made; registry and NOW are updated.

## Stop and ask if

A decision is not settled by the owner or accepted ADRs, or a step would change a running service or owner data.

## Report

What was built, verification, deploy-sequence position and next module in at most five bullets.

