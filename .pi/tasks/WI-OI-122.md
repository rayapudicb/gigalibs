# WI-OI-122: F0 foundations for seven iDempiere-reference modules

- **Status:** Built (2026-10-29) — coordinator + org proofs; BP hold **release** is the module adapter proof
- **Work item:** WI-OI-122; evidence in `.pi/work/WI-OI-122.md`.
- **Size:** L

## Goal

Close the shared organization-ownership and document-action gaps needed by the seven modules, reusing accepted GigaLibs architecture.

## Scope

- **May change:** `packages/module-sdk`, `packages/document-lifecycle`, applicable organization contracts and module adapters/migrations, tests and release evidence.
- **Must not change:** CMMS import/export, another agent's work, secrets, or the web on port 5180.

## Read first

`docs/plans/idempiere-parity-modules-plan.md` F0; ADR-0018, ADR-0033 and ADR-0007; `.pi/PLAN.md` and the completeness standard.

## Steps

1. Inventory existing organization scope, module replicas, lifecycle and Finance posting; mark reuse and gaps.
2. Reuse ADR-0018's UNIT/SHARED/EITHER ownership contract and prove it on a representative tenant/sibling-unit table; each module card applies it to that module's rows and migrations.
3. Complete per-document action primitives with transaction-bound idempotency, permission, audit and outbox; keep reversal rules in each document graph, without cross-module ACID claims.
4. Prove transaction rollback, replay, contention and tenant isolation on throwaway PostgreSQL; module cards prove their relays, rejection and reconciliation.

## Done when

- [x] Shared foundation contracts are verified; module-owned migrations carry their own roll-forward evidence.
- [x] Negative security and recovery paths pass on throwaway PostgreSQL (document-action + org access).
- [x] First module adapter: BP hold release via coordinator; evidence in `.pi/work/WI-OI-122.md`.
- [ ] Full-repo `pnpm verify` clean (pre-existing failures may remain outside F0 scope).

## Stop and ask if

A decision is not settled by the owner or accepted ADRs, or a step would change a running service or owner data.

## Report

What changed, verification, next module and owner decisions in at most five bullets.
