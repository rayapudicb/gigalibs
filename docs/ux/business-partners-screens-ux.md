# Business Partner — screens UX spec (minimal entry · task benchmarks · outcomes)

**Design stance.** Every screen is built backwards from a **business outcome** and a **time-to-task** benchmark, not
from the data model. The rule: a user types only what the system genuinely cannot know; everything derivable is
derived, everything shared is inherited (Org-0 master data), everything computed (exposure, netting, available credit)
is **read-only and live**. `@medusajs/ui`, metadata-window driven, server-authoritative.

## Cross-cutting minimal-data-entry rules
- **Quick-create = 2 fields.** Name + Role flags (Customer/Vendor/Employee). Everything else defaults and is editable
  later in the detail.
- **Derive / inherit, never ask:** code auto-generated (`BP-000123`); currency, price list, tax rule, CoA control
  accounts inherited from the Org (Org-0 canon); status defaults `ACTIVE`; credit limit defaults `0` (= cash-only).
- **Computed is read-only:** exposure, available credit, netting, over-limit — shown as live tiles, never entered.
- **One reason, not per-field:** GxP "reason for change" is a single modal on save, not a field on every row.
- **Pickers over typing:** CoA account, currency, country are searchable selects; address uses autofill.
- **Progressive disclosure:** list → quick-create drawer → full detail. Advanced fields hidden until asked for.

## The screens

### 1. Partners (list + quick-create) — *the entry point*
| | |
|---|---|
| **User task** | Find a partner, or add a new one |
| **Benchmark** | Find in **≤ 5 s** (type-ahead search); create in **≤ 30 s / 2 required fields** |
| **Priority entry** | **Name** (req), **Role flags** (Customer/Vendor/Employee). Nothing else to start. |
| **Defaulted/derived** | code, currency (Org), status ACTIVE, credit limit 0, CoA control accts (from Org canon) |
| **Layout** | DataTable (left) with search + Role/Status facets; **"New" opens a right-side drawer** (2 fields → Save) |
| **Actions** | Search · New (drawer) · Open detail · bulk export |
| **Business outcome** | **One unified counterparty** (no Customer/Vendor/Employee duplication) → cross-module credit control + AR/AP netting become possible; faster onboarding |

### 2. Partner detail (split-screen, tabbed) — *the 360° view*
Left: the partner header (name, code, roles, status, live **credit gauge**). Right: tabs, all preloaded.
| Tab | User task | Benchmark | Priority entry | Actions | Outcome |
|---|---|---|---|---|---|
| **Overview** | Confirm who this is | 0 entry (read) | — | Edit (reason modal) | Single source of truth |
| **Locations** | Add a ship-to/bill-to | ≤ 20 s | Address (autofill) + mark **1 primary** | Add · set primary · archive | Correct delivery/billing, no re-keying |
| **Contacts** | Add a person | ≤ 15 s | Name + email | Add · archive | Reachable counterparty |
| **Credit** | See if they can transact | **0 entry, instant** | Credit **limit** (1 field, admin) | Place hold · release (maker-checker) · set limit | **Real-time credit decision** |
| **Financials (AR/AP netting)** | See net settlement position | **0 entry, instant** | — | (next) Run netting → settlement | **Reduce settlement volume & cash movement** |

### 3. Credit panel (the gauge, lives on the header + Credit tab) — *the decision*
| | |
|---|---|
| **User task** | "Can this partner place this order?" |
| **Benchmark** | **0 data entry, < 1 s** — a glance at the gauge |
| **Shows (live, read-only)** | Credit **limit**, **exposure** (OpenAR + UninvoicedOrders − Prepayments), **available**, over-limit badge, active-hold banner |
| **Priority action** | **Place hold** (1 click + reason) · **Release hold** (reviewer ≠ author) · adjust limit |
| **Business outcome** | **Blocks ghost sales / over-exposure at the point of sale** → fewer bad debts; the clerk is stopped with a clear toast, not after the fact |

### 4. AR/AP Netting (Financials tab) — *the cash win*
| | |
|---|---|
| **User task** | "What do we actually owe / are owed, net, for this partner?" |
| **Benchmark** | **0 entry, instant** |
| **Shows** | Open **AR**, Open **AP**, **nettable** (offset), **net position** (NET_RECEIVABLE / NET_PAYABLE / SETTLED), net amount — straight from `GET /v1/partners/:id/netting` |
| **Priority action** | (next slice) **Run netting** → one settlement document instead of two payments |
| **Business outcome** | **Fewer settlement transactions, lower bank fees, less float tied up** — measurable cash-cycle improvement |

### 5. Credit-Hold queue — *the control workflow*
| | |
|---|---|
| **User task** | Triage and clear credit holds |
| **Benchmark** | **≤ 10 s / hold** — 1-click release with reason |
| **Priority entry** | **Reason** (on release only) |
| **Actions** | Release (maker-checker: reviewer ≠ the person who placed it) · open partner · view exposure |
| **Business outcome** | **Audited, controlled credit-risk workflow** → compliance + no unilateral credit releases |

## Business outcomes, precisely
1. **Master-data de-duplication** — one counterparty replaces 3 records → fewer errors, instant cross-module credit.
2. **Real-time credit control** — over-limit orders blocked *before* they ship → lower bad-debt write-offs (measurable: count of blocked-over-limit attempts).
3. **AR/AP netting** — net a partner's receivable against its payable → fewer payments, lower bank/FX fees, less working capital locked.
4. **Audited credit lifecycle** — maker-checker holds + field-level reasons → audit/compliance ready.

## Build order (screens)
1. **Partners list + quick-create drawer** (2-field create) — unblocks everything, highest daily use.
2. **Partner detail header + Credit tab (live gauge)** — the decision surface; reuses existing credit-status + holds APIs.
3. **Financials tab (netting view)** — reads the new `GET /…/netting` endpoint (slice 2, already built).
4. **Locations + Contacts tabs.**
5. **Credit-Hold queue.**

Each screen = metadata window(s) + registered panel(s) (the S2b panel pattern), server-authoritative, `audit:design-tokens` clean, with a Playwright E2E that asserts the benchmark path (e.g. create-in-2-fields; clerk-blocked-on-hold).
