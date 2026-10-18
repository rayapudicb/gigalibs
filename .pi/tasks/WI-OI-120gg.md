# WI-OI-120gg: Parties on procurement order lines (Table 1 row 3 slice)

- **Status:** Proposed
- **Work item:** Phase 5B / T4. Evidence in `.pi/work/TABLE-1-AUDIT-2026-10-19.md`.
- **Size:** M

## Goal

A purchase order line requires a valid party reference from kernel `/parties` (server-enforced, tenant-scoped).

## Scope

- **May change:** `universal-procurement` API + metadata window; contracts if needed.
- **Must not change:** unrelated modules.

## Done when

- [ ] API test refuses PO line without party; metadata field visible
- [ ] `pnpm verify` passes

## Stop and ask if

- Party model changes need ADR.
