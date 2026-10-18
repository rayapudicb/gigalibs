# WI-OI-120ga (F2.9): Accounting review — Inventory receipt default posting

- **Status:** Packet in git (awaiting accountant; owner, 2026-10-18)
- **Work item:** WI-OI-120 (F2 / ADR-0033 D3). WI-OI-119 **P1-28**. Evidence in `.pi/work/F2.9-INVENTORY-RECEIPT-POSTING-ACCOUNTING-REVIEW.md`.
- **Size:** S (human gate; no product code unless accountant requires changes)

## Goal

A **named qualified accountant** (owner-appointed, independent of the implementer) reviews the **implemented**
Inventory receipt posting rule against `MODULE_ACTION_OUTCOMES.md` §3 and records accept / reject / conditions in
`.pi/work/WI-OI-120.md`.

## Scope

- **May change:** `.pi/work/*`, task card, accountant-facing clarifications in posting-rules comments (if requested).
- **Must not change:** posting behaviour without a follow-up WI after accountant rejection.

## Done when

- [ ] Review packet complete (see `.pi/work/F2.9-INVENTORY-RECEIPT-POSTING-ACCOUNTING-REVIEW.md`).
- [ ] Accountant sign-off recorded (name, date, outcome) in `.pi/work/WI-OI-120.md` § F2.9.
- [ ] Table 2 row #19 updated; owner accepts or defers in `.pi/NOW.md`.

## Stop and ask if

- Accountant requires a different account structure or entry type not covered by cost-profile mapping.
