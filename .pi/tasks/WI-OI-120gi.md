# WI-OI-120gi: Customer party on orders quotes and credit memos (Table 1 row 3)

- **Status:** Built (2026-10-19, `530c2597`; not on UAT)
- **Work item:** Table 1 row 3 (parties on O2C transactional docs).
- **Size:** S

## Goal

Sales quotes, sales orders, and customer credit memos require an active kernel party for `customerPartyId`.

## Done when

- [x] Migration **4** `require_active_party` on `gigalibs_orders`
- [x] Service checks on create quote, create order, create credit memo
- [x] Orders sales-order dictionary shows **Customer** field
- [ ] Full `pnpm verify` (deferred per batch rhythm)

## Evidence

- `modules/universal-orders/db/migrations/000004_orders_party_reference_guard.up.sql`
- `party-reference.ts` + unit test
