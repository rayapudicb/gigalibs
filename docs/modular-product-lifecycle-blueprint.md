# GigaLibs modular product and repository blueprint

**Date:** 2026-09-04  
**Status:** Proposed product architecture and delivery model  
**First product module:** Customer Invoicing and Accounts Receivable  
**Rule:** Only one module is built at a time

## 1. What I understand now

You are not building demo tabs or small plugins inside a GigaLibs application.

You are building a family of complete software products. Each module must:

- have its own usable web application;
- have its own API;
- own its database tables and migrations;
- work when no other GigaLibs business module is installed;
- run in GigaLibs Cloud, a customer's cloud, or a customer's data centre;
- be shipped as containers and installation packages;
- connect to the customer's identity provider, database, storage, email, and other services;
- communicate with other modules through documented APIs and events;
- be replaceable without reading or changing another module's database;
- include security, operations, documentation, tests, upgrades, backup, recovery, and support evidence;
- be a real product that a user can operate from beginning to end.

GigaLibs is the product family and optional control plane. It is not the database that every module must depend on.

### A module is

A module is a complete product boundary. For example, the AR module owns customers used for billing, invoices, invoice lines, invoice numbering, delivery records, payments applied to invoices, credit notes, customer statements, AR reporting, and its audit history.

It may publish an `invoice.issued` event. A Ledger module may choose to consume that event. AR still works if Ledger is not installed; it shows that accounting export has not been configured.

### A module is not

- a React screen calling the main platform's private tables;
- an iframe containing another product;
- a package that succeeds with fake provider data;
- a collection of shared tables with a different menu item;
- a frontend-only SDK;
- a thin wrapper around a vendor that cannot operate when the vendor is unavailable;
- automatically production-ready because its container starts.

### How modules talk without becoming dependent

Modules communicate using four public boundaries:

1. **OIDC/OAuth tokens** for identity and service authentication.
2. **Versioned REST APIs** described by OpenAPI for commands and queries.
3. **Versioned events** described by AsyncAPI/JSON Schema for asynchronous communication.
4. **Signed webhooks** for customers and systems that do not use a message broker.

They never communicate through cross-module SQL, foreign keys into another module's schema, shared ORM models, or direct imports from another module's internal code.

## 2. Do plans exist today?

There are two different meanings of “plan.”

### Delivery plan

Yes. `.pi/PLAN.md` and `.pi/WORK_ITEMS.md` define the G0–G7 delivery process, work items, reviewers, and current status. They currently describe a platform delivery sequence. They need an approved architecture update to make the independent-module product boundary explicit.

Release 1 is still between G4 and G5. The incomplete release evidence should be closed before the first new module enters Build.

### Customer subscription plan

The database contains early `Plan`, `Price`, and `Subscription` models, but FR-16 says usage and billing are not implemented. Therefore “default plan includes all modules” is not yet a working, certified feature.

The proposed plan model is:

| Plan | What it grants |
| --- | --- |
| `complete` | The default GigaLibs suite plan. It entitles the tenant to every generally available module. |
| `module-ar`, `module-support`, etc. | A customer buys or deploys one independent module. |
| `enterprise-custom` | An explicit list of modules, limits, regions, and support terms. |
| `internal-engineering` | All modules in non-production test environments; never used as a customer billing shortcut. |

An entitlement only says that a tenant purchased a module. It does not give every person access. Inside each module, roles and permissions remain deny-by-default.

For a standalone customer deployment, the module can accept a signed entitlement file or a configured license service. Loss of contact with the GigaLibs control plane must not corrupt customer data or stop already-authorized local work without an agreed grace-period policy.

## 3. Recommended Git model

Use the new public `gigalibs` repository as a **modular monorepo** initially. Repository location does not define runtime dependence; APIs, data ownership, isolated builds, and release artifacts do.

Do not create 109 repositories now. Create one complete module, prove that it can be built and run alone, and then repeat. A module can be extracted later into `gigalibs-module-<name>` without redesign if its ownership, license, customer delivery model, or release cadence requires a separate repository.

### Branch and release model

- `master` is protected and always releasable.
- `dev` is the integration branch created from `master`.
- Work happens on short-lived branches such as `feat/WI-OI-019-ar-invoice-issue`.
- Feature pull requests enter `dev`; reviewed release pull requests promote `dev` to `master`.
- CODEOWNERS require independent reviews for finance, tenancy, identity, secrets, migrations, external actions, and deployment.
- Required CI checks must pass before merge.
- Environments are promoted by immutable artifact digest, not by keeping `dev`, `staging`, and `production` code branches.
- Do not create a permanent branch per customer. Customer differences are configuration and private deployment overlays.

Recommended tags:

- `module-ar-v1.0.0`
- `module-support-v1.0.0`
- `platform-v1.0.0`
- `product-2026.09.0`, which points to an exact set of compatible module digests

### Public and private repositories

| Repository | Visibility | Contains |
| --- | --- | --- |
| `gigalibs` | Public, after review | Product code, module code, public contracts, Helm templates, examples, documentation, CI rules |
| `gigalibs-deployments` | Private | Customer/tenant environment overlays, account IDs, private endpoints, approved image digests, release promotions |
| Secret manager | Never Git | Passwords, API keys, signing keys, database credentials, customer certificates |
| Artifact repository | Controlled | Images, charts, SDK packages, migration bundles, SBOMs, signatures, provenance, QA evidence |

## 4. Target folder structure

This is the target structure. Moving the current files into it is a governed migration, not a simple rename.

```text
gigalibs/
├── .github/
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   ├── pull_request_template.md
│   └── workflows/
│       ├── validate-repository.yml
│       ├── module-ci.yml
│       ├── security.yml
│       ├── release-module.yml
│       └── release-product.yml
│
├── platform/
│   ├── portal/                    # Suite navigation and module catalogue
│   ├── control-plane/             # Tenants, entitlements, deployments, connections
│   ├── execution-plane/           # Shared execution only where a module opts in
│   └── module-registry/            # Module manifests and compatibility information
│
├── modules/
│   └── accounts-receivable/
│       ├── module.yaml             # Product identity and supported interfaces
│       ├── README.md
│       ├── CHANGELOG.md
│       ├── apps/
│       │   ├── web/                # Complete Next.js user application
│       │   ├── api/                # Complete NestJS API
│       │   └── worker/             # PDF, email, reconciliation, scheduled work
│       ├── domain/
│       │   ├── entities/
│       │   ├── commands/
│       │   ├── policies/
│       │   └── events/
│       ├── contracts/
│       │   ├── openapi.yaml
│       │   ├── asyncapi.yaml
│       │   └── schemas/
│       ├── sdk/
│       │   ├── typescript/
│       │   └── generated/
│       ├── db/
│       │   ├── schema/
│       │   ├── migrations/
│       │   ├── verification/
│       │   └── test-data/          # Test-only generators, never runtime seeds
│       ├── deploy/
│       │   ├── docker/
│       │   ├── compose/
│       │   ├── helm/
│       │   ├── terraform/
│       │   └── airgap/
│       ├── tests/
│       │   ├── unit/
│       │   ├── contract/
│       │   ├── integration/
│       │   ├── e2e/
│       │   ├── performance/
│       │   ├── security/
│       │   ├── accessibility/
│       │   ├── migration/
│       │   └── recovery/
│       ├── docs/
│       │   ├── requirements/
│       │   ├── architecture/
│       │   ├── user-guide/
│       │   ├── administrator-guide/
│       │   ├── api-guide/
│       │   └── runbooks/
│       └── release/
│           ├── artifact-manifest.yaml
│           ├── compatibility.yaml
│           └── evidence-index.yaml
│
├── shared/
│   ├── protocol/                   # Event envelope, error and pagination standards
│   ├── auth-contracts/             # OIDC claims and service-token contracts
│   ├── ui-kit/                     # Versioned design system; compiled into each UI
│   ├── observability/              # Logging/tracing conventions
│   └── testkit/                    # Non-production test helpers
│
├── product/
│   ├── plans/                      # Versioned module entitlements
│   ├── release-manifests/          # Exact compatible product composition
│   ├── compatibility/
│   └── local-stack/                # Whole-suite developer composition
│
├── tools/
│   ├── module-cli/                 # Validate, build, export and certify a module
│   ├── contract-checker/
│   ├── license-checker/
│   └── release-evidence/
│
├── archive/
│   └── quarantine/                 # Non-runtime source inventory, if retained
│
├── docs/
├── .gitignore
├── LICENSE                         # Must be chosen before public release
├── SECURITY.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── pnpm-workspace.yaml
└── README.md
```

### Rules that make this structure real

1. A module may import versioned `shared/*` protocols and UI packages.
2. A module may not import another module's domain, repository, ORM, or UI internals.
3. A shared package must be small, stable, versioned, and useful to at least two real consumers.
4. Every module CI job builds it in isolation and starts it without the platform.
5. Every module has its own database user and either its own database or its own schema.
6. No database foreign key or SQL query crosses a module boundary.
7. The whole product pins exact module versions; it never consumes `latest`.

## 5. Deployment modes for every module

The same module release must support these modes:

### GigaLibs suite mode

- The portal discovers the module from `module.yaml`.
- The portal links or routes the browser to the module's own web container; it does not embed the UI through an iframe or copy its pages.
- GigaLibs OIDC signs the user's token.
- The module validates the token and applies its own permissions.
- The module registers health, version, events, and links with the control plane.

### Customer-cloud standalone mode

- The customer's OIDC provider supplies identities.
- The customer supplies PostgreSQL, object storage, email, and observability endpoints, or uses the included dependencies.
- Helm installs API, UI, worker, migration job, network policy, service account, autoscaling, disruption budget, and monitoring rules.
- The module does not call the GigaLibs database.

### Small/self-contained mode

- Docker Compose starts the UI, API, worker, PostgreSQL, Redis if required, and S3-compatible development storage.
- It is suitable for evaluation or a defined small-production profile only after capacity and backup limits are documented.
- Default passwords and sample business records are forbidden. First-run setup creates a real administrator and empty workspace.

### Customer-provided PostgreSQL schema mode

- The customer can point the module at an existing compatible PostgreSQL cluster.
- The module receives a dedicated database role and schema such as `gigalibs_ar`.
- Migrations affect only that schema.
- There are no foreign keys or views into customer or other-module schemas.
- Import adapters map customer records into the module's public API; they do not join customer tables at runtime.

## 6. Module manifest

Every module has a machine-readable manifest similar to this:

```yaml
apiVersion: modules.gigalibs.io/v1
kind: Module
metadata:
  name: accounts-receivable
  version: 1.0.0
spec:
  displayName: Customer Invoicing and Accounts Receivable
  ui:
    standalone: true
    basePath: /ar
  api:
    version: v1
    openapi: contracts/openapi.yaml
  events:
    asyncapi: contracts/asyncapi.yaml
    emits:
      - ar.invoice.issued.v1
      - ar.payment.settled.v1
    consumes: []
  dependencies:
    requiredModules: []
    optionalModules:
      - ledger
  database:
    engine: postgresql
    minimumVersion: "16"
    ownsSchema: true
    crossSchemaAccess: false
  identity:
    protocol: oidc
  deployment:
    images:
      - ar-web
      - ar-api
      - ar-worker
    helmChart: deploy/helm
    compose: deploy/compose
  health:
    live: /health/live
    ready: /health/ready
  entitlements:
    module: accounts-receivable
```

The manifest is validated in CI and registered only after the corresponding artifacts and evidence exist.

## 7. First module: Customer Invoicing and Accounts Receivable

### What business problem it solves

A company needs to create a correct customer invoice, send it, know whether it was delivered, record or collect payment, handle partial payments and credits, see overdue money, and prove what happened.

The module replaces spreadsheets and fabricated invoice screens with an authoritative receivables product.

### Expected business outcomes

- Finance creates and issues invoices faster.
- Duplicate or incorrectly numbered invoices are prevented.
- Customers receive a verifiable invoice and can view its current balance.
- Finance can see total outstanding, overdue amount, and aging buckets.
- Duplicate payment notifications cannot apply money twice.
- Corrections are visible through credits/voids instead of hidden edits.
- Delivery and payment failures become work queues with owners.
- Every important action has an audit record.
- A customer can install only this module and use it without the rest of GigaLibs.

### Users

| User | What they need |
| --- | --- |
| AR clerk | Maintain customers, draft invoices, send invoices, record approved manual payments |
| AR manager | Approve high-value invoices, issue, credit, void, reconcile and manage exceptions |
| Finance controller/auditor | Read immutable records, reports, exports and audit history |
| Tenant/module administrator | Configure company identity, numbering, permissions, providers and retention |
| Customer billing contact | View/download invoices, see balance and payment instructions, pay through an approved hosted provider |
| Support/operator | Diagnose delivery/provider failures without seeing secrets or changing money records |

### User-facing functionality

#### Setup

- Connect an OIDC identity provider.
- Create the billing company/legal entity.
- Configure invoice number series, currency, locale, time zone, payment terms and document branding.
- Configure email and object storage.
- Optionally configure one payment provider.
- Assign module roles.
- Run connection and permission tests before enabling issue/send/payment actions.

#### Customer records

- Create and import customers.
- Maintain billing contacts and addresses.
- Store tax identity, exemptions, preferred currency, locale and payment terms.
- Deactivate a customer without deleting invoice history.
- Export the customer's portable record and statements.

#### Products and services

- Maintain reusable invoice items, descriptions, prices and units.
- Enter one-off lines without creating a catalogue item.
- Version prices; changing today's price does not change an issued invoice.

#### Invoice work

- Create a draft.
- Add, edit, reorder and remove draft lines.
- Calculate amounts on the server using integer minor units and a declared rounding rule.
- Save drafts safely with version conflict detection.
- Preview the exact PDF before issue.
- Submit an invoice for approval when policy requires it.
- Issue the invoice once; the system allocates the next number atomically.
- Download, print and resend the issued document.
- Never edit an issued invoice. Correct it with a credit note or governed void.

#### Delivery

- Send to one or more billing contacts.
- See queued, provider accepted, delivered, bounced, complained, failed and retrying states.
- Retry a failure without producing a second invoice.
- Keep the provider message ID and receipt.

#### Payments

- Display bank/payment instructions.
- Open provider-hosted checkout without passing card details through GigaLibs.
- Receive signed provider webhooks.
- Record an approved manual bank transfer, cheque or adjustment with evidence.
- Apply one payment across one or more invoices.
- Support partial payment and overpayment/on-account balance according to approved policy.
- Reconcile module records with the provider's settlement report/API.
- Handle failed, refunded, disputed and reconciliation-required states.

#### Credits and collections

- Create a full or partial credit note.
- Allocate the credit to an invoice.
- Mark overdue based on due date and policy.
- Send reminders only after notification preferences and dunning policy are approved.
- Produce customer statements.

#### Reports and operations

- AR dashboard with outstanding, due soon, overdue and collected values.
- Aging report: current, 1–30, 31–60, 61–90 and over 90 days.
- Invoice, payment, credit, delivery failure and reconciliation reports.
- CSV/PDF exports with permission and audit.
- Exception work queue with owner, cause, retry/reconcile action and evidence.
- Audit timeline for every invoice.

### UI application

The standalone Next.js application contains:

```text
/                         AR dashboard
/customers                Customer list
/customers/new            Create customer
/customers/:id            Customer detail, contacts, invoices and statement
/items                    Product/service catalogue
/invoices                 Searchable invoice list
/invoices/new             Draft editor
/invoices/:id             Invoice, balance, delivery, payments and audit
/approvals                Invoices waiting for approval
/credit-notes             Credit note list and creation
/payments                 Payment and allocation list
/reconciliation           Provider/manual reconciliation workbench
/aging                    AR aging report
/exceptions               Delivery/payment/processing failure queue
/audit                    Authorized audit search and export
/settings/company         Billing entity and branding
/settings/numbering       Invoice series
/settings/providers       Email, storage and payment connections
/settings/roles           Module permissions
/settings/retention       Retention, legal hold and export policy
/portal/invoices/:token   Customer portal entry with controlled authentication
```

Every page includes real empty, loading, forbidden, validation, conflict, failure, retry, stale-data, and success states. UI totals are display values; the API is authoritative.

### Public API

All write APIs require an idempotency key where repeating a request could create a second business effect. Updates require the expected resource version.

#### Module and setup

- `GET /health/live`
- `GET /health/ready`
- `GET /version`
- `GET/PATCH /v1/settings`
- `POST /v1/connections/{provider}:test`

#### Customers and catalogue

- `POST /v1/customers`
- `GET /v1/customers`
- `GET/PATCH /v1/customers/{id}`
- `POST /v1/customers/{id}:deactivate`
- `GET /v1/customers/{id}/statement`
- `POST/GET/PATCH /v1/items`

#### Invoices

- `POST /v1/invoices` — create draft
- `GET /v1/invoices` — filtered, paginated list
- `GET /v1/invoices/{id}`
- `PATCH /v1/invoices/{id}` — draft only
- `POST /v1/invoices/{id}:submit-for-approval`
- `POST /v1/invoices/{id}:approve`
- `POST /v1/invoices/{id}:issue`
- `POST /v1/invoices/{id}:deliver`
- `POST /v1/invoices/{id}:void`
- `GET /v1/invoices/{id}/document`

#### Credits and payments

- `POST /v1/credit-notes`
- `GET /v1/credit-notes/{id}`
- `POST /v1/payments/manual`
- `GET /v1/payments`
- `POST /v1/payments/{id}:allocate`
- `POST /v1/payments/{id}:refund`
- `POST /v1/webhooks/payments/{provider}`
- `POST /v1/reconciliation-runs`
- `GET /v1/reconciliation-runs/{id}`

#### Reports, exceptions and audit

- `GET /v1/reports/aging`
- `GET /v1/reports/receivables`
- `POST /v1/exports`
- `GET /v1/exceptions`
- `POST /v1/exceptions/{id}:retry`
- `POST /v1/exceptions/{id}:reconcile`
- `GET /v1/audit-events`
- `GET /v1/events/stream` — authorized server-sent status updates

### Events emitted by AR

- `ar.customer.created.v1`
- `ar.invoice.approval-requested.v1`
- `ar.invoice.issued.v1`
- `ar.invoice.delivery-status-changed.v1`
- `ar.invoice.voided.v1`
- `ar.credit-note.issued.v1`
- `ar.payment.received.v1`
- `ar.payment.settled.v1`
- `ar.invoice.balance-changed.v1`
- `ar.reconciliation-required.v1`

Events are published only after the database transaction commits. A consumer can receive an event more than once and must deduplicate it. Events contain stable public references and no secrets or raw payment card data.

### Module-owned database

The AR module uses its own database or dedicated schema. It has no foreign key to the platform tenant table.

| Table | Purpose |
| --- | --- |
| `module_workspaces` | Local workspace and external tenant reference |
| `identity_mappings` | OIDC issuer/subject to local user reference |
| `role_bindings` | Module-specific user/service permissions |
| `billing_entities` | Company/legal identity that issues invoices |
| `customers` | Customer master record |
| `customer_contacts` | Billing and portal contacts |
| `catalog_items` and `price_versions` | Reusable products/services and historical prices |
| `invoice_series` | Locked number sequence per workspace/entity/series/period |
| `invoices` | Invoice header, immutable issue snapshot and exact totals |
| `invoice_lines` | Quantity, unit price, discount, tax input and total |
| `invoice_approvals` | Required approval decisions and reasons |
| `invoice_artifacts` | PDF object key, hash, template/version and generation status |
| `delivery_attempts` | Email/provider intent, attempts, receipts and failures |
| `credit_notes` and `credit_note_lines` | Append-only invoice corrections |
| `payments` | Verified payment evidence and state |
| `payment_allocations` | Payment/credit application to invoice balances |
| `provider_webhook_inbox` | Raw-payload reference/hash, signature result and deduplication |
| `reconciliation_runs` and `reconciliation_findings` | Comparison with provider authority |
| `idempotency_records` | One business effect for repeated write requests |
| `outbox_events` | Reliable events written in the business transaction |
| `audit_events` | Append-only user/system action history |
| `exceptions` | Recoverable failures with owner and next action |
| `retention_holds` | Retention/legal-hold controls |

Database rules enforce:

- workspace isolation on every business record;
- unique invoice numbers in the billing entity/series/period scope;
- exact integer monetary values and currency;
- header and line totals reconcile;
- issued invoices cannot be changed or deleted;
- payment evidence begins pending and cannot silently become settled;
- duplicate provider events cannot apply payment twice;
- allocations cannot exceed available payment/credit or invoice balance;
- corrections use credits/voids rather than destructive edits.

Production migrations create empty tables. Test data is generated only inside isolated test environments.

### Required integrations

The first production release should certify the smallest useful set:

1. OIDC identity provider.
2. PostgreSQL.
3. S3-compatible object storage for PDFs.
4. One email provider with delivery callbacks/receipts.
5. Optional one payment provider using hosted/tokenized checkout.
6. OpenTelemetry-compatible logs, metrics and traces.

Every provider must have timeouts, retries, circuit breaking, idempotency, credential references, signature verification, rate-limit handling, data classification, visible failure, reconciliation and an operator runbook.

## 8. End-to-end module lifecycle

### G0 — Decide whether to build it

Tasks:

- Name the customer problem and measurable business outcome.
- Identify pilot customers, roles, countries, currencies, expected volume and constraints.
- Review existing code and open-source/provider candidates.
- Define what the module will not do.
- Create the stable work item and assign human authorities.

Deliverables:

- problem statement;
- success metrics;
- stakeholder/pilot record;
- build/buy/sidecar decision;
- initial risk and license findings;
- module charter.

Exit: product and architecture accept the module charter.

### G1 — Define the product

Tasks:

- Write user journeys and acceptance tests.
- Define roles and permissions.
- Define business states and rules.
- Define data ownership, retention and portability.
- Define supported deployment modes and service levels.

Deliverables:

- approved requirements and non-functional requirements;
- story map and UI state catalogue;
- business glossary;
- permission matrix;
- acceptance matrix;
- requirement-to-outcome trace.

Exit: requirements are testable and independently reviewed.

### G2 — Design the system and risks

Tasks:

- Define module boundary and optional integrations.
- Design database, transactions, numbering and migrations.
- Design APIs, events, idempotency and compatibility.
- Threat-model tenant isolation, identity, secrets, providers and financial data.
- Decide backup, restore, recovery, upgrades and rollback/roll-forward.
- Complete exact dependency and license review.

Deliverables:

- ADRs;
- threat model and data-flow diagram;
- schema and migration plan;
- OpenAPI/AsyncAPI drafts;
- deployment architecture;
- capacity model and SLO proposal;
- provider/license decision record;
- disaster-recovery design.

Exit: architecture, security, data, SRE and finance/domain reviewers approve the design.

### G3 — Design the experience and verification

Tasks:

- Produce accessible UI flows for every state.
- Freeze API/event schemas for implementation.
- Create the end-to-end test plan and production-shaped test generator.
- Define dashboards, alerts, runbooks and support workflow.
- Define release and rollback criteria.

Deliverables:

- approved UI prototype/specification;
- versioned contracts;
- test cases and test-data specification;
- telemetry specification;
- release/cutover plan;
- traceability matrix.

Exit: engineering and QA can build/test without inventing missing behavior.

### G4 — Build the complete vertical product

Recommended AR implementation increments:

1. Standalone boot, OIDC, workspace/roles, health, empty migration and module manifest.
2. Customers, contacts, catalogue and settings.
3. Draft, approval, atomic issue, immutable invoice and PDF.
4. Email delivery, portal and delivery failure handling.
5. Payments, allocations, credit notes and reconciliation.
6. Aging, reports, exports, audit, exceptions and operations.
7. Docker, Helm, standalone export and upgrade paths.

Each increment includes UI, API, domain logic, database, events/jobs, permissions, tests, telemetry and documentation. There is no “backend finished, frontend later” certification.

Exit: module-completeness review finds no missing production path.

### G5 — Prove it works

Run against real PostgreSQL, Redis if used, object storage, OIDC and provider sandboxes.

Required QA:

- unit and property tests;
- API and event contract tests;
- real-database integration tests;
- full browser E2E tests for every role and critical state;
- tenant/workspace isolation and permission-negative tests;
- concurrency and idempotency tests;
- invoice-numbering and money-invariant tests;
- migration from empty and previous supported versions;
- backup and restore tests;
- worker/provider crash, timeout, rate-limit, duplicate webhook and replay tests;
- load, endurance and noisy-neighbour tests;
- accessibility and usability tests;
- SAST, secret, dependency, container and IaC scans;
- SBOM/license verification;
- Docker Compose and Helm install/upgrade/rollback tests;
- standalone test proving that no platform service/database is required;
- import/export and customer-data portability test.

Exit: independent QA, security, SRE, finance/domain and product authorities accept the evidence.

### G6 — Package and release

Tasks:

- Freeze source and lockfiles.
- Build once in CI.
- Sign and publish immutable artifacts.
- Rehearse installation, upgrade and recovery.
- Publish compatibility, release notes and known limitations.
- Obtain human release authorization.

Exit: an approved artifact digest is promoted to a limited cohort.

### G7 — Operate and prove the outcome

Tasks:

- Observe SLOs, error budget, delivery failures and reconciliation.
- Measure the promised business outcome.
- Run support/on-call and recovery exercises.
- Review security and dependency updates.
- Decide expand, correct, or roll back.

Exit: production evidence shows that the module is reliable and useful. Only then may the next module enter Build.

## 9. Module release artifacts

Each module version publishes:

### Executable and deployable artifacts

- `ar-web` OCI image;
- `ar-api` OCI image;
- `ar-worker` OCI image;
- versioned database migration job/image;
- OCI Helm chart;
- Docker Compose bundle;
- optional Terraform examples;
- offline/air-gapped bundle with checksums;
- TypeScript SDK package and generated client;
- OpenAPI, AsyncAPI and JSON Schemas.

### Trust and operations artifacts

- CycloneDX/SPDX SBOM for every image and the module;
- vulnerability, secret, SAST, dependency, license, container and IaC scan results;
- signed image/chart digests;
- build provenance/attestation;
- compatibility matrix;
- migration verification and recovery plan;
- backup/restore evidence;
- performance/capacity report;
- penetration/security review summary;
- accessibility report;
- dashboards, alerts and runbooks;
- release notes and known limitations;
- requirement-to-test-to-artifact evidence index.

### JFrog-style repository layout

```text
docker-release-local/gigalibs/accounts-receivable/ar-web/1.0.0
docker-release-local/gigalibs/accounts-receivable/ar-api/1.0.0
docker-release-local/gigalibs/accounts-receivable/ar-worker/1.0.0
helm-release-local/gigalibs/accounts-receivable/1.0.0
npm-release-local/@gigalibs/ar-sdk/1.0.0
generic-release-local/gigalibs/accounts-receivable/1.0.0/openapi.yaml
generic-release-local/gigalibs/accounts-receivable/1.0.0/asyncapi.yaml
generic-release-local/gigalibs/accounts-receivable/1.0.0/migrations.tar.gz
generic-release-local/gigalibs/accounts-receivable/1.0.0/evidence.tar.gz
generic-release-local/gigalibs/accounts-receivable/1.0.0/sbom.cdx.json
generic-release-local/gigalibs/accounts-receivable/1.0.0/artifact-manifest.yaml
```

Public releases can use GitHub Releases, GitHub Container Registry and an npm-compatible public registry. Customer/private releases can be mirrored into JFrog Artifactory. Promotion always uses the same digest produced by CI.

## 10. Whole-product release artifacts

A GigaLibs suite release publishes:

- platform portal and control-plane images;
- a product release manifest pinning every included module image/chart digest;
- plan/entitlement catalogue version;
- module compatibility and API/event compatibility matrix;
- umbrella Helm chart and local Compose profile;
- aggregated SBOM, vulnerability status and provenance;
- system-wide E2E, tenant-isolation, upgrade-order and recovery evidence;
- product dashboards, SLOs, alerts and incident runbooks;
- release notes, known limitations and supported deployment matrix;
- customer installation, administration, user and upgrade guides;
- air-gapped product bundle if supported.

The product release does not rebuild module images. It composes already signed, independently certified module versions.

## 11. Public repository safety before the first push

The current local directory has no `.git` directory. It also has no root `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, CODEOWNERS or `.github` governance directory.

Important findings before making it public:

- `.env` exists and is currently ignored. Never force-add it.
- `.pnpm-store`, test results and local generated artifacts need explicit ignore/review.
- `data/runtime-store.json` contains `tenants` and `users` sections and is not currently ignored. It must be classified, sanitized/replaced with a test-only generator, or excluded before the first commit.
- The repository license must be chosen. Public source without a license is not automatically open source.
- All third-party code and retained prototype assets require license/provenance review.
- Customer names, emails, internal hosts, tokens and fabricated success records should not be published as if they were product fixtures.

Required pre-push gate:

1. Choose and add the repository/module license with legal approval.
2. Add `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, CODEOWNERS and pull-request policy.
3. Expand `.gitignore` and remove/sanitize local or customer-like data.
4. Run secret scanning over every file, including generated and archived files.
5. Run license and copyright scanning.
6. Run production-data, quarantine, dependency, API, navigation and SDLC audits.
7. Run build and tests from a clean checkout.
8. Review the exact staged file list before committing.
9. Enable GitHub secret scanning/push protection, branch protection, required PR reviews and required status checks.

Do not run `echo "# gigalibs" >> README.md`; this repository already has a README and product history. After the public-readiness work is accepted, the existing repository flow is:

```bash
git init -b main
git remote add origin https://github.com/rayapudicb/gigalibs.git
git status --short --ignored
git add .
git diff --cached --check
git diff --cached --name-only
# Run the approved secret/license/data scans here and review their output.
git commit -m "chore: initialize GigaLibs product repository"
git push -u origin main
```

These commands are a handoff, not authorization to push the current unreviewed directory.

## 12. Module roadmap after AR

Only AR enters Build first. After it reaches accepted G5, choose the next module from validated demand:

| Order | Independent product module | Plain-English purpose |
| ---: | --- | --- |
| 1 | Customer Invoicing and AR | Issue invoices, collect/reconcile payments and manage receivables |
| 2 | Usage and Subscription Billing | Meter usage, apply plans/prices/limits and generate billable charges |
| 3 | Payment Orchestration | Connect approved payment providers, route, refund, dispute and reconcile |
| 4 | Financial Ledger | Record immutable balanced postings and produce controlled accounting exports |
| 5 | Support Desk and SLA | Manage customer cases, queues, ownership, SLA timers and resolution evidence |
| 6 | Document Intake and OCR | Receive documents, extract fields with confidence and human review, retain provenance |
| 7 | E-Signature and Contracts | Prepare, sign, seal, verify and retain agreements under approved jurisdictions |
| 8 | Workflow and Rules | Run durable work, approvals, waits, retries, compensation and versioned decisions |
| 9 | Tenant Administration and IAM | Users, groups, SSO/MFA/SCIM, roles, environments and delegated administration |
| 10 | Notifications and Webhooks | Reliable in-app/email/SMS/push intent, preference, receipt and outbound webhook delivery |
| 11 | Search and Knowledge | Authorized search, indexing, knowledge management and governed retrieval |
| 12 | Analytics and Reporting | Governed dashboards, scheduled reports, exports and freshness/lineage |
| 13 | Commerce Orders and Cart | Catalogue, pricing, cart, checkout, order, fulfilment, refund and returns |
| 14 | Maps and Geofencing | Authoritative spatial queries, maps, zones, location events and route integrations |
| 15 | Fraud/KYC/Risk | Provider-backed identity/risk evidence, policies, review queues and explainable decisions |
| 16 | Connector Catalogue | Certified read/write connectors with credentials, checkpoints, failures and reconciliation |

This order can change through product discovery. No module becomes active because its folder exists.

## 13. Immediate decision and next action

The architecture decision to approve is:

> GigaLibs modules are independently deployable products. They own their UI, API, schema, migrations, operations and releases. They integrate through identity, versioned APIs, events and signed webhooks, never shared databases. The public monorepo is a development home, not a runtime dependency.

After that decision:

1. Complete the public-repository safety and governance gate.
2. Update the requirements baseline and ADRs without renumbering FR-01–FR-16.
3. Have `sdlc_orchestrator` create/approve the stable AR work item.
4. Finish the current Release 1 G5 blockers.
5. Build only the AR module through G0–G7.
6. Prove the AR release runs alone in a clean customer-like environment.
7. Select the next module only after AR has independent acceptance and observed evidence.
