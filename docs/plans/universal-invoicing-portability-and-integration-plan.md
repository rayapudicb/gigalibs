# Universal invoicing portability and integration plan

Status: Architecture guidance before contract acceptance or implementation  
Date: 2026-09-10  
Related work: WI-OI-019, WI-OI-039 and WI-OI-040

## 1. Clarified product goal and sequence

GigaLibs first builds and certifies a complete standalone universal invoicing product. That product has its
own persistent generic work-source and billable-record entry, approval, configuration, invoicing and
reporting journeys. The initial GigaLibs build does **not** consume WhooCrew APIs and has no dependency on
WhooCrew's event, workforce, payroll, expense or equipment applications.

After the GigaLibs release is complete, it is frozen as a named version. Its requirements, contracts,
behavior, configuration schemas and conformance tests become a portable implementation pack. A master
prompt uses that pack to build an equivalent Java/React implementation inside the client application.
Only that client implementation is then customized to consume the client's APIs and add client-specific
fields, mappings, layouts and templates.

```text
Phase A: build complete dynamic GigaLibs invoicing
                         │
                         ▼
Phase B: certify and freeze versioned implementation pack
                         │
                         ▼
Phase C: reproduce equivalent invoice product in Java/React
                         │
                         ▼
Phase D: add WhooCrew APIs, mappings and client configuration
```

GigaLibs does not impose Next.js, NestJS, FastAPI or its physical database design on the client. It defines
the business behavior that the later implementation must reproduce.

The portable product is the observable contract and behavior:

- canonical invoice and billable-source semantics;
- versioned APIs and events;
- financial invariants and state machines;
- governed configuration and UI manifests;
- authentication, authorization and tenant-isolation obligations;
- error, idempotency, correction and reconciliation behavior;
- deterministic examples and executable conformance tests.

The current TypeScript implementation can be one reference implementation. A Java/React implementation
can be another. Both must satisfy the same contracts and conformance evidence.

## 2. Do not use source code or a prompt as the product contract

A master prompt that translates every source line into Java will copy implementation details, framework
assumptions and defects. It cannot reliably preserve transaction boundaries, concurrency behavior,
database guarantees, rounding, authorization or recovery semantics. Re-running it later can produce a
different system.

Use a versioned **implementation specification pack** as the source of truth. A master prompt may instruct
an implementation agent to consume that pack, but the prompt does not define business truth.

```text
requirements + decisions
          │
          ▼
versioned contract/specification pack
          │
          ├───────────────┐
          ▼               ▼
TypeScript reference   Java implementation
          │               │
          └───────┬───────┘
                  ▼
         shared conformance suite
                  │
                  ▼
       equivalent observable behavior
```

### 2.1 Required specification-pack artifacts

| Artifact | What it makes portable |
| --- | --- |
| Requirements and business glossary | Meaning of customer, work source, billable record, draft, issue, supplement, correction and payment state |
| State-machine specifications | Allowed commands, transitions, permissions, preconditions, effects and immutable boundaries |
| OpenAPI | Commands, queries, schemas, errors, security, pagination, idempotency and optimistic concurrency |
| AsyncAPI | Committed events, envelopes, ordering expectations, deduplication and compatibility |
| JSON Schema | Source records, dynamic configuration, resolved manifests, template structures and import packages |
| Calculation specification | Decimal/money representation, rounding points, pricing modes, markup precedence, tax boundaries and totals |
| Permission and data-classification matrix | Platform, tenant, role, record and field access with masking/export rules |
| Persistence semantics | Uniqueness, immutability, tenant ownership, atomicity, retention and recovery obligations without prescribing table names |
| Error catalogue | Stable machine code, HTTP/event disposition, retryability, user action and reconciliation requirement |
| Golden test vectors | Inputs and exact outputs for calculations, lifecycle, retries, duplicates, corrections and supplements |
| UI behavior manifest | Registered surfaces, fields, components, actions, states and accessibility requirements |
| Operational profile | Health, telemetry, SLO, backup/restore, migration and provider-failure expectations |
| Compatibility policy | Additive change rules, deprecation windows, capability negotiation and version support |

Narrative requirements without these artifacts are insufficient for an independent reimplementation.

## 3. Build, freeze and replication boundaries

| Stage | Data source and runtime | Required result |
| --- | --- | --- |
| GigaLibs standalone build | Data is entered through GigaLibs generic configured screens/APIs and persisted in GigaLibs-owned storage | Complete universal invoice product with no WhooCrew dependency |
| Frozen GigaLibs release | Named artifacts, contracts, migrations, docs and test vectors are immutable | Reproducible baseline and implementation pack |
| Java/React replica | Client team/agent implements the frozen behavior in its selected stack | Passes the same contract, financial, security and lifecycle conformance suite |
| Client customization | The replica integrates the client's actionable-data APIs and adds allowed fields/layouts/templates | Client-specific experience without changing universal invoice invariants |

The GigaLibs and client installations are separate products/deployments. Each deployment has exactly one
authoritative invoice command owner and database. There is no shared database or dual write between them.

## 4. Standalone generic input before client integration

The GigaLibs version proves source-based invoicing without WhooCrew by providing persistent generic
entities and configured screens for:

- `WorkSource`: an event, project, job, order, case, service period or another configured label;
- `BillablePartyReference`: an optional worker, contractor, asset or other participant reference;
- `BillableSourceRecord`: dated approved quantity, cost, charge or contracted component;
- `ChargeCategory`: labor, overtime, allowance, bonus, equipment, fuel, travel or tenant-defined category;
- `EvidenceReference`: a stored or referenced receipt, approval or supporting document;
- pricing/rate/markup policy and approval state;
- invoice allocation, exception, correction and supplemental-family history.

Authorized users create these records using the same server commands and real persistence used by the
invoice engine. Certification data is visibly identified and isolated, but is never a browser-only fixture
or fabricated API success. This makes GigaLibs independently demonstrable and business-testable.

The generic screen labels, optional attributes, categories, sections and templates are dynamic. Record
identity, money types, approval semantics, source allocation and invoice lifecycle remain coded invariants.

## 5. Future client-replica inbound contract

After the Java/React replica passes baseline conformance, its client-specific adapter maps WhooCrew
actionable data into the same canonical commands used by the standalone entry screens. The client system
does not send its internal tables or require the invoice kernel to understand its database structures.

```json
{
  "contractVersion": "1.0",
  "sourceSystem": "client-crew-platform",
  "sourceRecordId": "shift-charge-84931",
  "sourceVersion": 3,
  "workSource": {
    "type": "EVENT",
    "externalId": "event-2026-1042"
  },
  "customerExternalId": "customer-381",
  "categoryCode": "OVERTIME",
  "serviceDate": "2026-09-08",
  "participantExternalId": "worker-942",
  "quantity": {"value": "4.00", "unit": "HOUR"},
  "pricingMode": "RATE_CARD",
  "currency": "USD",
  "approval": {
    "status": "APPROVED",
    "approvedAt": "2026-09-09T10:15:00Z",
    "approvedByExternalId": "manager-73"
  },
  "evidenceReferences": ["receipt-1882"],
  "attributes": {"venueZone": "B"}
}
```

This is an illustrative contract shape, not an accepted API schema. The eventual schema uses decimal
strings or integer minor units, bounded attributes and exact conditional requirements for each pricing
mode.

### 5.1 Registered pricing modes

The tenant or integration profile selects a registered server-owned pricing strategy:

| Pricing mode | External system supplies | Invoice engine owns |
| --- | --- | --- |
| `EXTERNAL_BILLED_AMOUNT` | Approved final line amount and currency | Validation, allocation, grouping, invoice lifecycle and audit |
| `RATE_CARD` | Approved category, quantity, unit and dimensions | Versioned customer rate selection and calculation |
| `COST_PLUS_POLICY` | Approved raw cost and category | Versioned markup policy and billed amount calculation |
| `FIXED_CONTRACT_COMPONENT` | Approved milestone/component reference and completion | Versioned contracted amount and eligibility rules |

This supports crewing, professional services, logistics, equipment rental, healthcare services and other
industries without treating arbitrary formulas as configuration. Adding a new label or category is
configuration. Adding a new financial calculation method is a versioned product capability.

### 5.2 Client-adapter ingestion behavior

1. The external system obtains a service identity through the approved OAuth/OIDC or signed integration
   profile. Tenant authority is derived from that identity, not from a trusted request field.
2. It submits or publishes a stable record ID, monotonically governed source version, approval state and
   idempotency key.
3. The mapping layer resolves external customer, category, unit and optional fields to canonical IDs.
4. Invalid or unmapped records enter a visible quarantine/exception state; they never become silently
   billable.
5. Accepted records are persisted with payload digest, source lineage and the resolved contract/config
   versions.
6. The event billing summary derives eligibility from committed accepted records.
7. Invoice generation reserves eligible records and records immutable source-to-line allocations.
8. A later source version causes refresh before issue or a correction case after issue. It never mutates an
   issued invoice silently.

Inbound APIs may support individual and bounded bulk submission. Async ingestion uses the same validation
and result semantics. Every record has an attributable accepted, rejected, duplicate, superseded or
quarantined outcome.

## 6. Where dynamic behavior belongs

Universal does not mean that every concept becomes an arbitrary field. It means the stable kernel accepts
different industries through registered profiles and adapters.

### 5.1 Configurable without source changes

- client-replica external-to-canonical customer, category, unit and reference mappings;
- charge-category labels and invoice section placement;
- customer rate-card values and effective dates for registered pricing strategies;
- percentage/flat markup policies within approved calculation semantics;
- optional non-financial attributes and field sets;
- customer/segment screen layouts and document-template bindings;
- invoice numbering patterns made from allowlisted tokens;
- delivery mode, approval route and missed-billing duration within supported policies;
- field visibility, masking and exports within permissions that code permits.

### 5.2 Requires a coded, versioned extension

- a new pricing, overtime, tax or rounding algorithm;
- a new invoice state or financial transition;
- a new external authentication or provider protocol;
- a new executable workflow action;
- a new component type that can execute logic or access data;
- changed tenant-isolation or permission semantics;
- shared-database writes into the client's internal tables.

The code-owned capability registry is portable. Configuration selects and parameterizes capabilities; it
does not upload executable JavaScript, Java, SQL or unrestricted expressions.

## 7. Portable dynamic React experience

The UI should consume a resolved, versioned manifest rather than compile tenant fields into application
source code. A registered surface such as `ar.invoice_draft.review` returns:

- canonical fields and tenant-approved extension fields;
- layout sections and registered component IDs;
- labels, help, validation and conditional presentation;
- read/write/mask/export decisions for the current authenticated principal;
- allowed actions and state-dependent disabled reasons;
- schema/layout/template versions and checksum.

GigaLibs may provide a reference React renderer and generated TypeScript client. A client can instead build
its own React design system adapter that maps the same component IDs to its components. Server APIs remain
authoritative for permissions, validation, calculations and transitions.

This gives the client native visual control without duplicating invoice rules in the browser.

## 8. Java/React reimplementation package

After the v1 behavior and contracts are accepted, a Java implementation effort should consume:

1. generated Java DTO/interfaces from the accepted OpenAPI and event schemas;
2. the language-neutral state machines and calculation specification;
3. database obligations and migration scenarios rather than copied PostgreSQL table code;
4. the same golden financial vectors and API/event conformance suite;
5. security tests for tenant, role, object and field isolation;
6. concurrency/idempotency tests for generation, issue, supplements and correction;
7. a generated TypeScript API client plus the manifest/component contract for React;
8. deployment, recovery and observability certification for the client's chosen runtime.

The master prompt should reference immutable specification-pack versions and require all conformance tests
to pass. It should never contain credentials, production data or copied sample success responses. Generated
code receives ordinary architecture, security and domain review.

### 8.1 Definition of equivalent implementation

For every certified scenario, both implementations must produce the same:

- accepted/rejected command result and stable error code;
- monetary values, rounding and resolved policy lineage;
- state transition and immutable snapshot;
- idempotent replay result;
- source allocation and supplemental sequence;
- authorization outcome and field disclosure;
- committed event type, version and business payload;
- correction/reconciliation disposition.

Internal class names, frameworks, ORM, table layout and React component library may differ.

## 9. Contract and profile layering

Use these layers so client-specific needs do not fork the kernel:

```text
Universal invoice contract v1
  └─ capability profile: source billing v1
      └─ industry profile: event/crewing v1
          └─ tenant configuration version
              └─ customer/segment bindings
```

- The universal contract defines invoice identity, money, lifecycle and source allocation.
- A capability profile declares supported pricing modes, templates, delivery and correction behaviors.
- An industry profile supplies semantic mappings and required categories without changing core entities.
- Tenant configuration supplies rates, labels, optional fields, policies and templates.
- Customer bindings select the applicable tenant configuration.

Every request/result records the relevant contract and configuration versions. This makes historical
invoices explainable after either implementation or configuration changes.

## 10. Required implementation order

1. **Finish the GigaLibs foundations:** IAM/tenancy/RBAC, universal configuration and standalone AR module
   owners must be durable before dynamic invoice expansion.
2. **Freeze vocabulary and invariants:** accept invoice, source, allocation, supplement, correction, money
   and identity semantics.
3. **Build standalone generic capture:** persisted work sources, billable records, categories, evidence,
   approval and exceptions with configured labels and layouts; no WhooCrew API calls.
4. **Complete the universal invoice outcome:** pricing, draft, review, issue, document, delivery, payment,
   correction, supplements, audit and reporting using the standalone records.
5. **Complete dynamic configuration:** registered pricing profiles, fields, layouts, templates, versioned
   publishing, activation and rollback under WI-OI-039.
6. **Publish and test contracts:** OpenAPI/AsyncAPI, schemas, state machines, stable errors and golden tests
   must match the completed behavior.
7. **Certify and freeze GigaLibs version 1:** finish security, tenancy, migration/restore, concurrency,
   accessibility, performance, UAT and release evidence; produce immutable artifact/checksum references.
8. **Generate the replication prompt:** reference the frozen implementation pack and require its full
   conformance suite; do not translate source line by line.
9. **Build and certify the Java/React replica:** prove equivalent business behavior with its own database,
   migrations and operations.
10. **Customize only the replica:** add WhooCrew authentication, API/event adapters, mappings and permitted
    fields/layouts/templates, then rerun baseline plus client-profile certification.

## 11. Current repository gap

The existing AR OpenAPI covers setup, customers, manual invoice draft/revision and issue. Its AsyncAPI
covers the committed invoice-issued event. The standalone generic work-source entry, billing summary,
invoice-family, configuration-manifest and conformance-pack contracts described here remain proposed under
WI-OI-039 and WI-OI-040. WhooCrew API ingestion is intentionally deferred to the later client replica.

The current implementation therefore demonstrates part of one reference stack. It is not yet a portable,
industry-neutral specification pack, certified Java implementation or production-ready universal
invoicing platform.
