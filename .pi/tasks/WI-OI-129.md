# WI-OI-129: Project Accounting and WBS

- **Status:** Approved (owner, 2026-10-28); queued after WI-OI-123–128 and Finance/AR posting and billing contracts
- **Work item:** WI-OI-129; evidence in `.pi/work/WI-OI-129.md`.
- **Size:** L

## Goal

Complete Module 7, Project Accounting and WBS, from `docs/plans/idempiere-parity-modules-plan.md` through real persisted journeys. Build and commit the full module before starting the next; owner deploys the seven-module batch once after all builds.

## Scope

- **May change:** `modules/project-operations`, project/inventory/AR/Finance contracts, dictionary, tests and module-owned migrations.
- **Must not change:** CMMS import/export, another agent's work, secrets, or the web on port 5180.

## Read first

The matching module section of the parity plan; `.pi/PLAN.md`, requirements baseline, SDLC and completeness standards; ADR-0018, ADR-0033, ADR-0007; affected contracts and migrations.

## Steps

1. Build project, phase, task, issue, time and labor-rate persistence with tenant RLS and owning-unit scope.
2. Implement exact material/labor accrual, WIP, milestone and T&M billing with idempotent downstream handshakes.
3. Publish Gantt, burn matrix and timesheet approval; prove Phase-1 milestone draft and failure recovery.

## Done when

- [ ] Every named slice, screen, handshake and key failure path in the plan works with real persistence and authorized scope.
- [ ] Migration verification, roll-forward, audit, relay replay and E2E evidence are recorded.
- [ ] `pnpm verify` passes with no new failures; module-completion commit is made; registry and NOW are updated.

## Stop and ask if

A decision is not settled by the owner or accepted ADRs, or a step would change a running service or owner data.

## Report

What was built, verification, deploy-sequence position and next module in at most five bullets.

