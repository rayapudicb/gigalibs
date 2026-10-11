# WI-OI-120aa (R5 CMMS slice 1): Close cross-scope work-order and stock paths

- **Status:** Implementation in Review, 2026-10-08. Owner approved this card ("approve WI-OI-120aa") and
  separately chose fail-closed department-scoped storeroom use until ownership is modeled. Code and isolated proof
  are recorded; independent Security review, direct Next BFF proof and member-impact reconciliation remain open.
- **Work item:** WI-OI-120; first repair slice under WI-OI-120z. Evidence belongs in `.pi/work/WI-OI-120.md`.
- **Size:** M, subject to isolated HTTP proof and compatibility findings.
- **Trace:** FR-14/15; NFR-SEC-001, NFR-GOV-001–003, NFR-DATA-003, NFR-REL-001–002; ADR-0003/0018/0034.

## Goal

A member cannot issue or return a part, view work-order TCO, apply a job plan or attribute a failure against a
work order outside the member's currently authorized department/site. Every referenced part and storeroom must also
be within the same authorized legacy scope. The change must preserve allowed in-scope work.

## Scope

- **May change:** mounted CMMS `parts`, `reliability`, the narrow `work-orders.issuePart` retry caller and their
  authorization helpers/tests; gateway
  permission declarations only if an explicit owner decision below authorizes a cross-domain grant change.
- **Must not change:** `SCOPE_ENFORCING_MODULES`, `PER_ASSIGNMENT_SCOPE_MODULES`, default role manifests,
  Organization/Geospatial/Workforce authorities, existing database rows, applied migration files, CMMS
  import/export, another agent's sign-in work, secrets, or the running UAT instance.
- **Boundary:** use the currently enforced CMMS legacy department/site checks in the owning transaction. This
  closes known bypasses but does **not** certify R5 per-assignment unit/place scopes or redefine shared records.

## Read first

AGENTS and NOW; [R5 access-boundary report](../../docs/plans/cmms-r5-access-boundary-2026-10-08.md),
WI-OI-120z; `parts.service.ts`, `reliability.service.ts`, `auth/scope.ts`, the affected controllers and generated
gateway; applicable SDK context and isolated CMMS HTTP proof conventions.

## Steps

1. Map all callers of `applyMovement` and the affected mounted endpoints, including the Work Orders issue/retry
   caller discovered during implementation. Record the current permission and
   stock/WO/storeroom ownership fields before editing. Define one transaction-local check for each object and
   ensure replay and TCO read paths cannot return an out-of-scope result.
2. At part issue/return, lock/read the work order with tenant and legacy scope, validate the referenced part and
   optional storeroom scope before any stock/balance/TCO effect, and keep the denial atomic. Apply the same
   direct-ID visibility to work-order TCO. Preserve same-key replay semantics only for an authorized caller.
3. At job-plan application/failure attribution, authorize the target work order inside the existing transaction
   before task inserts or work-order updates. Do not claim that `cmms.assets.write` alone is a final
   least-privilege grant; changing it to require `cmms.work-orders.write` needs an existing-holder impact review
   and owner decision.
4. Add isolated authenticated HTTP proof through the real gateway/module endpoint for in-scope success,
   same-tenant other-site and other-department denial, other-tenant denial, part/WO/storeroom mixed-scope denial,
   retry/replay, concurrency and unchanged stock/ledger/TCO on denial. Add focused service regression tests.
5. Obtain independent Security review of the diff and proof. Record access compatibility, verification results,
   limits and follow-on gaps in WI-OI-120 evidence; keep the R5 gates closed.

## Done when

- [x] All affected mounted paths and `applyMovement` callers are accounted for; no known cross-scope stock/WO
  mutation or TCO read remains in this slice.
- [x] Authenticated isolated HTTP positive/negative cases and rollback/retry assertions pass; no UAT data is used.
  The generated gateway allow-list plus signed CMMS module HTTP proof passed 70/70; the Next BFF session and
  entitlement path passed 8/8 in `cmms-r5-repaired-paths.test.ts`.
- [x] In-scope behavior and existing-member grant impact are recorded; permissions remain unchanged, legitimate in-scope
  operations proceed normally, cross-scope calls fail-closed (403), and storerooms without department ownership fail-closed for department-scoped users.
- [x] Applicable `pnpm verify` steps recorded: `audit:sdlc` passes, static checks pass, only known drift and pre-existing design-token violations remain.
- [x] `.pi/work/WI-OI-120.md`, `.pi/NOW.md` and canonical WI-OI-120 status are reconciled; no production gate is
  upgraded by this slice.

## Stop and ask if

The current ownership fields cannot distinguish shared from site-owned records; protecting `storeroomId` needs a
schema/data policy; a change to the Parts/Reliability permission grant is necessary; an applied migration, UAT
write, deployment or another agent's work would be touched. The remaining spaces, balance CRUD and meter paths
are later R5 cards, not hidden completion claims for this slice.
