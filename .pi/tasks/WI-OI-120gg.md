# WI-OI-120gg: Parties on procurement order lines (Table 1 row 3 slice)

- **Status:** Built (2026-10-19, local evidence; not on UAT)
- **Work item:** Phase 5B / T4. Evidence in `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** M

## Goal

A purchase order (and related payables documents) requires a valid party reference from kernel `/parties` (server-enforced, tenant-scoped).

## Scope

- **May change:** `universal-procurement` API + metadata window; contracts if needed.
- **Must not change:** unrelated modules.

## Done when

- [x] API refuses PO / vendor bill / debit memo when `vendorPartyId` is missing in kernel parties (migration **4**, `require_active_party`)
- [x] Metadata PO window shows **Vendor** field (`vendor-id` in procurement configuration adapter)
- [ ] `pnpm verify` passes (run before commit / UAT)

## Evidence

- `modules/universal-procurement/db/migrations/000004_procurement_party_reference_guard.up.sql`
- `modules/universal-procurement/apps/api/src/procurement/party-reference.ts` + unit tests
- `SCHEMA_CONTRACT_VERSION` **4**; `infra/compose/generated/compose.module-host.yaml` updated via `pnpm modules:catalog`

## Stop and ask if

- Party model changes need ADR.
