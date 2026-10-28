# WI-OI-123: Universal Business Partner

- **Status:** In progress (owner, 2026-10-28); core credit path extended (Orders feed, credit-check, feed marks); full gate and Built status pending verify/conformance
- **Work item:** WI-OI-123; evidence in `.pi/work/WI-OI-123.md`.
- **Size:** L

## Goal

Complete Module 1, Universal Business Partner, from `docs/plans/idempiere-parity-modules-plan.md` through real persisted journeys. Build and commit the full module before starting the next; owner deploys the seven-module batch once after all builds.

## Scope

- **May change:** `modules/business-partners`, kernel Party integration contracts and BFF composition, credit contracts, gateway routes, dictionary, tests and module-owned migrations; the Finance account-reference read endpoint and AR/Orders ownership/event contract changes required for the credit handshake.
- **Must not change:** CMMS import/export, another agent's work, secrets, or the web on port 5180.

## Read first

The matching module section of the parity plan; `.pi/PLAN.md`, requirements baseline, SDLC and completeness standards; ADR-0018, ADR-0033, ADR-0007; affected contracts and migrations.

## Steps

1. Reuse kernel Party as the sole partner/contact/location authority. Build a versioned party projection, customer/vendor accounts and credit-hold persistence with forced tenant RLS and explicit organization ownership.
2. Implement credit exposure, holds, signed credit checks, invoice consumption and AR/AP netting with idempotent relays.
3. Publish partner and hold windows, live credit status, the AI explanation where its governed source is available, and the blocked-clerk journey.

## Current slice evidence (2026-10-28)

- S1: module-owned forced-RLS schema for Party/role projections, customer/vendor accounts, vault-only bank references, immutable credit ledger, holds, inbox and organization replica. The kernel queues organization versions for this module and relays Party/role events through a signed private inbox. Migration and ordered replay passed on isolated PostgreSQL 16.
- S3 in progress: customer/vendor account create/list routes require a live canonical Party role, explicit owning unit and a signed Finance validation of the active subledger control account. Customer create/replay/sibling denial and one audit/outbox fact passed against isolated PostgreSQL 16. Terms version source, edits and metadata windows remain open.
- S4 in progress: pure exact-minor-unit exposure calculation has four tests. AR invoice issue, payment/credit-note and void snapshots now feed a signed Business Partner inbox; Orders exposure, prepayments and source freshness/watermark controls remain open.
- [x] AR/Orders ownership sub-slice implemented and proved: Orders dispatch carries its existing unit owner; AR migration 17 preserves historical NULL owners for reconciliation while rejecting new ownerless drafts/invoices and owner changes. Manual draft/issue requires the signed, active organization version. AR gets the kernel version through its local replica; the metadata invoice form asks for the owner.
- [x] Orders fulfillment delivery sub-slice implemented and proved: the Orders outbox leases only dispatched fulfillment facts to a body-bound Ed25519 AR inbox. AR requires a configured Party/customer mapping, billing entity and default series; creates one owned invoice with a source-fulfillment key, audit, outbox fact and replay receipt in a local transaction. Isolated PostgreSQL 16 tests covered migration, lease filtering, invoice/replay and owner mutation denial.
- [x] AR open-balance feed sub-slice implemented and proved: migration 18 captures ordered, owner/Party-mapped invoice snapshots on issue, payment and void in the local transaction. A dedicated Ed25519 relay targets the Business Partner credit inbox. The inbox validates the contract, refuses gaps, stale/reused source versions and changed-message replay, and appends exact delta entries under forced tenant RLS. AR and BP isolated PostgreSQL 16 proofs passed.
- S4 extended (2026-10-28): Orders migration 6 queues `orders.credit.uninvoiced-balance.v1` snapshots; BP inbox consumes them into `UNINVOICED_ORDER` deltas; `credit_feed_marks` tracks feed readiness; `POST v1/credit-check` exposes signed gateway check with idempotent outcomes. PREPAYMENT feed seeds on customer account create; OPEN_AP netting read remains 0 until vendor-bill feed. Historical-owner reconciliation, Playwright journey, module conformance record and clean full `pnpm verify` remain open.

## Done when

- [ ] Every named slice, screen, handshake and key failure path in the plan works with real persistence and authorized scope.
- [ ] Migration verification, roll-forward, audit, relay replay and E2E evidence are recorded.
- [ ] `pnpm verify` passes with no new failures; module-completion commit is made; registry and NOW are updated.

## Stop and ask if

A decision is not settled by the owner or accepted ADRs, or a step would change a running service or owner data.

## Report

What was built, verification, deploy-sequence position and next module in at most five bullets.

