# Crewing event invoicing discovery brief

Status: Problem framing before requirements acceptance or implementation  
Date: 2026-09-10  
Related work: WI-OI-039 and WI-OI-040

## 1. What we currently understand

An event-crewing business assigns several workers to an event across one or more shift dates. After the
event, an invoice coordinator must visit each worker's records and manually collect regular shift work,
overtime, per diem, bonuses, equipment charges, fuel, travel and other approved billable costs. The
coordinator then checks the information, groups it, calculates the customer charge and prepares the
invoice.

This takes roughly two to three hours for an event. The primary problem is repeated collection and
reconciliation of records, not document formatting alone.

The desired business outcome is:

> Select an event, see every approved and missing billable record, resolve exceptions, and generate one
> accurate review-ready invoice without reopening every worker record.

The detailed notes supplied on 2026-09-10 are discovery input. They are not accepted wholesale as product
requirements. Only the capabilities below are needed to test this problem and outcome.

## 2. Minimum useful scope

### 2.1 Approved source records

The standalone GigaLibs build creates versioned, approved records through its own generic configurable
billing-input screens and APIs. It does not consume WhooCrew APIs in this phase. The later Java/React client
replica maps records from the client's system into this same canonical model.

Each billable source record needs, at minimum:

| Area | Minimum information |
| --- | --- |
| Event | Tenant, customer, bill-to account, event/work reference, service dates and currency |
| Worker shift | Worker reference, shift date, role, regular quantity, overtime quantity and approval state |
| Adjustment | Per diem, bonus or another approved earning/charge category, quantity or amount and reason |
| Expense | Fuel, travel or another reimbursable category, amount, receipt/evidence reference and approval |
| Equipment | Equipment/service category, quantity, dates or duration and approved charge basis |
| Lineage | Source system, stable record ID, version, approved-by/time, corrected-by/time and ingestion status |

A worker name or event label is display context. Stable source IDs and versions prevent duplicate billing
and make corrections traceable.

### 2.2 Event billing workspace

For one selected event, the coordinator needs a single workspace showing:

- workers and source-record counts;
- approved, pending, rejected, incomplete, already invoiced and ready-to-bill records;
- totals by labor, overtime, per diem, bonus, equipment, fuel, travel and other configured categories;
- missing rate, mapping, approval or evidence exceptions;
- raw cost, markup and proposed billed amount for authorized internal users;
- a disabled Generate action when no records are eligible.

The coordinator should open an exception directly from this workspace instead of searching worker by
worker.

### 2.3 Review-ready draft

Generate creates a persistent draft from exactly the eligible approved source versions. It must:

1. reserve those records so another invoice cannot use them;
2. apply the approved customer/category pricing or markup policy;
3. group lines into understandable labor, allowance, equipment and expense sections;
4. retain the source records behind every calculated invoice line;
5. display calculation and missing-data errors instead of inventing defaults;
6. allow an authorized reviewer to correct configuration or source exceptions and regenerate safely;
7. issue only after explicit review under the configured delivery policy.

If records are approved after the original invoice, the same action creates a supplemental draft containing
only the newly eligible records. It does not rebuild or mutate the issued invoice.

## 3. Universal model and crewing configuration

The invoice kernel remains universal. It understands a work source, billable source records, charge
categories, calculated invoice lines, allocations and an invoice family. It does not contain hard-coded
worker, shift, per-diem or event tables.

```text
GigaLibs configured input
  work/shift ─────┐
  overtime ───────┤
  per diem ───────┤
  bonuses ────────┼─> approved versioned source records
  equipment ──────┤                  │
  fuel/travel ────┘                  ▼
                          event billing summary
                                   │
                                   ▼
                       review-ready invoice draft
                                   │
                         issue / later supplement
```

The standalone build uses a module-owned manual/configured adapter. After replication, the WhooCrew API
adapter replaces manual capture for the client while preserving the universal source contract. New source
semantics still require an adapter because identity, approval and correction rules affect financial truth.

Tenant administrators may configure approved charge categories such as `PER_DIEM`, `FUEL`, `TRAVEL` or
equipment categories, their display labels, invoice section and applicability. They cannot create an
arbitrary money formula. A new calculation basis, such as daily per diem, mileage, overtime bands or
equipment duration, must use a registered calculation type with server validation and tests.

Optional operational fields such as venue, crew call reference or client job code can use WI-OI-039's
versioned field sets and customer-specific layouts. Core amounts, quantities, rates, approval, allocations
and invoice status remain typed business fields.

## 4. First user journey

1. An authorized GigaLibs user records work, allowances, expenses and equipment using configured screens.
2. Authorized approvers approve or reject each persisted source record.
3. The billing coordinator opens the event after completion or at the billing cutoff.
4. The workspace shows what is ready and what is blocking completion.
5. The coordinator resolves only the listed exceptions.
6. Generate creates a draft from the approved eligible records.
7. The coordinator reviews sections, calculations, customer reference and template.
8. An authorized user issues or marks the invoice Ready to Send.
9. Later approvals appear as ready for a supplemental invoice.

For a clean event whose source records and configuration are complete, the existing WI-OI-040 target is a
review-ready invoice journey within two minutes. Exception-resolution time is measured separately because
the invoicing application cannot repair missing operational approvals automatically.

## 5. What from the granular notes matters now

| Include in first business slice | Reason |
| --- | --- |
| Ready-to-bill event summary | Removes worker-by-worker searching and shows the true workload |
| Sold-to/bill-to identity and billing contact | Necessary to produce a valid customer invoice |
| Labor, overtime, per diem, bonus, equipment, fuel and travel categories | Represents the described sources of billable value |
| Service date, description, quantity, rate and amount | Minimum explainable invoice-line detail |
| Customer/category markup with controlled override | Converts approved cost or quantity to the customer charge |
| Internal classification excluded from customer output | Supports internal reporting without leaking internal data |
| Section grouping and subtotals | Makes a mixed labor/equipment/expense invoice readable |
| Source evidence references | Lets a reviewer validate expenses without duplicating files in invoice data |
| Draft review, issue and supplemental invoice | Completes the event-to-invoice outcome and handles late approvals |
| Audit and duplicate/missed-billing controls | Provides financial reliability and accountability |

## 6. Defer or keep outside this slice

| Granular note | Disposition |
| --- | --- |
| LinkedIn, social profile, referral source and marketing consent | CRM/marketing concern; unrelated to event invoice preparation |
| Weekly, bi-weekly and monthly recurring invoices | Separate recurring/contract billing use case |
| A system-wide fifth-of-month deadline | Tenant/customer policy only if validated; never a universal hard-coded rule |
| Full inventory stock management and bundles | Equipment/asset module; AR consumes an approved equipment charge |
| Arbitrary on-the-fly financial fee definitions | Defer until a governed charge catalog and registered calculation types exist |
| Automatic reminders, view tracking and resend history | Collections and delivery slice after accurate invoice generation |
| OTP-protected receipt cloud links and a fixed 20 MB rule | Document/security design requiring validated client and threat-model needs |
| AI file/photo extraction | Later assisted capture; must retain human approval and source evidence |
| QuickBooks parity | Product-copying goal is unsuitable; implement a provider adapter only after the core flow works |
| Batch generation across events | Later optimization after single-event correctness and concurrency are proven |
| Full invoice delete | Use cancel/version for drafts and void/correction for issued invoices; preserve financial history |
| Exact Net 30 day-count convention | Finance decision that must be confirmed per contract/jurisdiction before coding |

## 7. Confirmed delivery sequence

The product owner clarified this sequence:

1. Build the complete standalone dynamic invoicing product in GigaLibs without WhooCrew integration.
2. Certify and freeze that version so routine client work does not change it.
3. Generate a master implementation prompt from its versioned specification and conformance pack.
4. Build an equivalent Java/React replica within the client application.
5. Customize only that replica to consume WhooCrew APIs and add client-required fields and templates.

Before freezing the portable contract, GigaLibs still must decide:

1. Does each source record provide a final customer-billed amount, quantity for a GigaLibs rate card, or
   raw cost for a GigaLibs markup policy?
2. Which stable external IDs and version rules identify work sources, customers, workers and charge records?
3. Which generic manual-entry/import commands prove every source-record state in standalone GigaLibs?
4. How are external customers, categories, units and optional attributes mapped and versioned?
5. Which source corrections supersede unissued records, and which create post-issue reconciliation cases?
6. Can one work source split by bill-to entity, PO, currency, department or service period?
7. Which evidence references may be shown on an internal screen or customer document?
8. Which authentication, tenant-resolution, data-residency and delivery profiles the portable contract
   must support when implemented later by a client.

These choices select registered capabilities in the universal contract. The
[portability and integration plan](universal-invoicing-portability-and-integration-plan.md) defines the
standalone-build, freeze, Java/React replication and later client-adapter sequence.

## 8. Acceptance evidence for the first slice

Use real isolated certification records created through the same APIs and persisted stores as normal data.
No UI fixtures or generated success responses qualify.

- An event containing multiple workers, dates and all described charge categories produces the expected
  draft total with source-to-line traceability.
- Pending, rejected, incomplete and previously invoiced records do not enter the draft.
- Two simultaneous Generate requests cannot bill the same source record twice.
- A later approved record produces a linked supplemental invoice.
- A source correction after issue creates a review case and does not rewrite issued history.
- Tenant and role tests prevent cross-tenant access and unauthorized cost/override visibility.
- Data remains after service restart and the issued document is reproducible from its snapshots.
- A billing user completes the clean-event path without opening individual worker records, with the time
  measured from opening the event workspace to creation of the review-ready draft.

This evidence proves the stated business outcome. It does not certify recurring billing, inventory,
collections automation, AI extraction, external accounting synchronization or production release.
