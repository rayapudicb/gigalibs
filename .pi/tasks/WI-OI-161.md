# WI-OI-161: Workflow steps with compensation for cross-module operations

- **Status:** Proposed — approved in the execution plan (owner, 2026-11-03); confirm this card with the owner before it starts. Phase 3; needs WI-OI-156.
- **Work item:** WI-OI-161. Evidence goes in `.pi/work/WI-OI-161.md`.
- **Size:** M. **Plan:** §6; analysis §6.2 (P5).

## Goal

Operations that span modules — quote to order with a stock reservation, purchase order to receipt to vendor bill — run as
one flow that resumes after a failure and undoes completed steps when a later one fails.

## Scope

- **May change:** a step and compensation API on `packages/jobs` (durable kernel jobs); the document actions that start
  the first two flows; proofs; tests.
- **Must not change:** posting rules. Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Read first

`packages/jobs/src/`; the document actions in Orders, Inventory and Procurement; the P2P and O2C proof harnesses.

## Steps

1. Step API: step, compensate, idempotency key per step, resume after a crash, visible state.
2. Flow 1: quote → sales order → reservation. Flow 2: purchase order → receipt → vendor bill.
3. Prove both on the PostgreSQL proof harnesses, including a forced failure midway.

## Done when

- [ ] Both flows complete, and a failure midway leaves no half-done documents
- [ ] Journey timings for create-from improve against WI-OI-151
- [ ] `pnpm verify` passes; `audit:layers` classifies every new model, `audit:design-tokens` and `audit:ui-shell` pass
- [ ] Evidence is recorded in `.pi/work/WI-OI-161.md`, and `.pi/NOW.md` is updated

## Stop and ask if

- a decision is needed that ADR-0037–0040, the execution plan or the owner has not settled;
- a step would change a running service, the UAT database or the owner's data;
- a compensation would reverse a posted ledger entry.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
