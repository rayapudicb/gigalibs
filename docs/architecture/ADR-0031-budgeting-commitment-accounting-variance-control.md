# ADR-0031: Budgeting, Financial Planning, Commitment Accounting & Variance Control Engine

- **Status:** Accepted
- **Date:** 2026-10-04
- **Work item:** WI-OI-117
- **Depends on:** ADR-0016, ADR-0020, ADR-0024, ADR-0025, ADR-0026, ADR-0027, ADR-0028, ADR-0029, ADR-0030

## Context

Financial Operations (`WI-OI-094`), Subledgers (AP, AR, Inventory), Treasury (`WI-OI-095`), Fixed Assets (`WI-OI-114`), Multi-Company Consolidation (`WI-OI-115`), and Inventory Costing (`WI-OI-116`) provide comprehensive, tamper-proof accounting for recorded historical actuals in `gigalibs_finance`.

However, enterprise financial governance requires forward-looking financial control, commitment accounting, and variance enforcement:
1. **Lack of Pre-Flight Spend Governance:** Purchase requisitions and purchase orders could be approved and committed without checking against authorized budgetary allocations, leading to cost overruns before invoices hit Accounts Payable or the General Ledger.
2. **Absence of Commitment Accounting (Encumbrances):** Standard general ledger accounting records expenses only when an AP bill is posted. Without encumbrance accounting, the time lag between purchase order issuance and invoice receipt conceals real financial liability, creating false illusions of available funds.
3. **No Governed Multi-Dimensional Budgeting:** Organizations could not allocate annual fiscal budgets across multi-dimensional intersections (Legal Entity + Accounting Book + Fiscal Year/Period + Natural Account + Cost Center / Department + Project Code).
4. **Missing Maker-Checker Budget Versioning:** Budget revisions were unversioned and lacked strict maker-checker segregation of duties, risking unapproved budget expansion.
5. **No Real-Time Variance Engine:** Financial controllers had no instantaneous visibility into the Budget vs. Actual vs. Encumbered burn rate matrix across periods and cost centers.

Phase 13 (`WI-OI-117`) delivers the **Budgeting, Financial Planning, Commitment Accounting & Variance Control Engine** inside `modules/financial-operations` (`gigalibs_finance` v6), providing forward-looking financial guardrails, automated encumbrance tracking, fail-closed spend enforcement, and real-time variance analytics.

---

## Decision

### 1. Separation of Concerns: Architecture vs Metadata

| Domain | Governed by Architecture Foundations (Database, Engine, Security) | Governed by Metadata Foundations (Application Dictionary & Studio) |
|---|---|---|
| **Security & Isolation** | Hardware Row-Level Security on `gigalibs_finance`, tenant isolation, signed token contexts. | Budget reviewer roles, budget studio visibility permissions. |
| **Arithmetic & Invariants** | Zero floating-point math; exact BigInt integer minor units for monetary balances. Cent conservation across periodic distributions: $\sum \text{periods} = \text{AnnualBudget}$. | Currency display symbols, percentage formatting. |
| **Commitment Accounting** | Encumbrance lifecycle state machine (`PRE_COMMITMENT` -> `ENCUMBRANCE` -> `ACTUAL` -> `LIQUIDATED`), automated liquidation upon AP matching. | Commitment category labels, UI badge colors. |
| **Spend Policy Enforcement** | Fail-closed pre-flight validation gate: `HARD_STOP` (rejection), `ADVISORY_WARN`, `AUDIT_LOG`. Evaluation: $\text{Available} = \text{Budget} - (\text{Actual} + \text{Encumbered})$. | Warning toast messages, threshold slider configurations. |
| **Audit & Immutability** | Database triggers prohibiting alteration or deletion of `ACTIVE` or `FROZEN` budget revisions and liquidated commitment lines. | Revision commentary, approval notes. |

---

### 2. Multi-Tier Budget Model & Dimensionality

Budgets are structured with multi-dimensional granularity:
1. **Budget Structures (`budget_structures`):**
   - Types: `OPERATING_OPEX`, `CAPITAL_CAPEX`, `PROJECT`, `REVENUE`.
   - Bound to an `AccountingBook` (legal entity functional currency).
   - Configurable control action: `HARD_STOP`, `ADVISORY_WARN`, `AUDIT_LOG`, `DISABLED`.
   - Optional overspend tolerance percentage (e.g. 5% buffer).
2. **Versioned Budget Revisions (`budget_revisions`):**
   - Versioning sequence (`revision_number`: 1, 2, 3...).
   - Lifecycle: `DRAFT` -> `SUBMITTED` -> `APPROVED` -> `ACTIVE` -> `REVISED` / `SUPERSEDED` / `FROZEN`.
   - Segregation of Duties: Submitter (`created_by`) cannot approve (`approved_by`).
   - Activating revision $N+1$ atomically supersedes revision $N$.
3. **Budget Lines (`budget_lines`):**
   - Specific allocation to: `account_id` (COA), `cost_center_id` (Org Unit), optional `project_code`, and `fiscal_period_id`.
   - Allocated amount minor: integer cents.

---

### 3. Commitment Accounting & Encumbrance Lifecycle

To prevent budget exhaustion before invoice arrival, GigaLibs implements commitment accounting across four distinct lifecycle stages:

```
[Purchase Requisition] ──> PRE_COMMITMENT (soft hold on budget line)
                                │
[Purchase Order Approved] ───> ENCUMBRANCE (hard commitment on budget line)
                                │
[AP Bill Matched & Posted] ──> ACTUAL_CONSUMPTION (GL Expense posted; encumbrance LIQUIDATED)
                                │
[PO Cancelled / Reduced] ────> RELEASE (commitment returned to available budget)
```

1. **Pre-Commitment:** Reserved during purchase requisition approval.
2. **Encumbrance:** Firm legal commitment created upon Purchase Order approval.
3. **Liquidation:** When the vendor invoice (AP Bill) is matched and posted to the General Ledger, the corresponding encumbrance is marked `LIQUIDATED`, transitioning the fund consumption from "Committed" to "Actual".
4. **Release:** If an order is canceled or partially closed, unused encumbrances are released immediately back into the available budget pool.

---

### 4. Real-Time Spend Availability & Enforcement Equation

The spend pre-flight verification gate calculates availability synchronously in exact integer minor units:

$$\text{Available Budget} = \text{Allocated Amount Minor} - (\text{Posted GL Actuals Minor} + \text{Active Commitments Minor})$$

When an operational transaction (Purchase Requisition, PO, or Direct Expense) requests funds:
$$\text{Allowable Limit} = \text{Available Budget} + \left\lfloor \text{Allocated Amount Minor} \times \frac{\text{Tolerance Pct}}{100} \right\rfloor$$

- If $\text{Requested Amount} \le \text{Allowable Limit}$: Permitted.
- If $\text{Requested Amount} > \text{Allowable Limit}$:
  - If Policy is `HARD_STOP`: Fails-closed with `BUDGET_EXCEEDED_HARD_STOP` exception, preventing document approval.
  - If Policy is `ADVISORY_WARN`: Permitted with warning flag and notification event.
  - If Policy is `AUDIT_LOG`: Permitted and written to audit stream.

---

### 5. Deterministic Periodic Distribution (Zero Float Conservation)

Annual budget targets are decomposed across monthly fiscal periods using integer arithmetic:
- Base monthly allocation: $\text{Base} = \lfloor \text{Annual Minor} / 12 \rfloor$.
- Remainder: $R = \text{Annual Minor} - (12 \times \text{Base})$.
- The remainder $R$ is added to the first (or designated) period, guaranteeing:
  $$\sum_{p=1}^{12} \text{Period Allocation}_p = \text{Annual Target Minor} \quad (\text{Exact cent conservation})$$

---

### 6. Subledger & General Ledger Invariants

1. **Double-Entry Independence:** Budget allocations and commitments are auxiliary control ledgers; they do not alter historical double-entry balance sheet accounts ($1400, 2000, 3000$) until actual financial events occur.
2. **Reconciliation Consistency:** Actual expenditures computed by the Budgeting Engine for an account/cost-center must exactly equal the net debit balance of that account in `gl_journal_lines`.
3. **Fail-Closed Immutability:** Once a budget revision is marked `ACTIVE` or `FROZEN`, database triggers prevent any modification of its lines. Adjustments must follow a formal revision process.

---

## Consequences

### Positive
- Prevents unbudgeted corporate spending before purchase commitments are legally dispatched to vendors.
- Closes the critical time lag between purchase order creation and invoice receipt via commitment accounting.
- Provides controllers with real-time Budget vs. Actual vs. Encumbered visibility across departments and projects.
- Enforces strict segregation of duties through versioned maker-checker approvals.

### Negative / Trade-offs
- Requires synchronous pre-flight budget checks during Purchase Requisition and PO approval workflows.
- Operational teams must manage formal budget revision cycles when business needs require budget reallocation.
