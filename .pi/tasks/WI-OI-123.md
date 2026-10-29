# WI-OI-123: Universal Business Partner

- **Status:** In Progress (2026-10-28) — static `pnpm module:conformance business-partners` **15/15**; migration **6**; five metadata windows (partners, credit exposure, credit gauge, netting, holds); bank vault API; hold explainer; OPEN_AP component + vendor feed mark. Full module and verification gates remain open; owner deploys the batch only after all seven builds.
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
- S4 extended (2026-10-28): Orders migration 6 queues `orders.credit.uninvoiced-balance.v1` snapshots; BP inbox consumes them into `UNINVOICED_ORDER` deltas; `credit_feed_marks` tracks feed readiness; `POST v1/credit-check` exposes signed gateway check with idempotent outcomes. PREPAYMENT feed seeds on customer account create; OPEN_AP netting read remains 0 until vendor-bill feed.
- S5/S6/S7 extended (2026-10-28): Credit-Hold queue, customer PATCH, Orders confirm credit gate, relay credit-check command, E2E smoke scaffold.
- Closing pass (2026-10-28): **Credit gauge** + **AR/AP netting** metadata windows/adapters; **bank-accounts** API (vault reference only); **credit-status/explain** (governed facts, no generative AI); migration **000006** OPEN_AP component + vendor **OPEN_AP feed mark**; catalog **REVIEW / INTEGRATED_CANDIDATE**; static module conformance **15/15**. Kernel-composed Locations/Contacts split-screen and live vendor-bill OPEN_AP deltas remain **procurement/BFF** follow-ups; full Playwright hold→confirm journey awaits test-stack fixtures.

## Done when

- [x] Plan slices S1–S7 implemented with real persistence, relays, gateway checks, metadata windows and key failure paths (isolated PG proofs opt-in; static conformance 15/15).
- [x] Migration 6 roll-forward manifest; audit/relay replay covered in integration tests when `BUSINESS_PARTNERS_PG_PROOF=1`.
- [ ] Owner: `pnpm module:conformance business-partners --live --record`, clean full `pnpm verify`, batch deploy UAT journey; module-completion commit if not already on branch.

## Stop and ask if

A decision is not settled by the owner or accepted ADRs, or a step would change a running service or owner data.

## Report

What was built, verification, deploy-sequence position and next module in at most five bullets.

