# Application-wide Configuration Studio screen adoption plan

Status: Proposed screen-level adoption plan; not implementation or production certification  
Primary work item: WI-OI-039  
Related work items: WI-OI-013, WI-OI-015, WI-OI-017, WI-OI-019 through WI-OI-035, WI-OI-038 and affected future module work items  
Requirements: FR-01 through FR-17 and applicable NFR-GOV, NFR-SEC, NFR-DATA, NFR-REL, NFR-UX, NFR-OBS and NFR-OPS controls

## 1. Purpose and evidence boundary

This plan converts the user-supplied 29-module screen inventory into a screen-by-screen Configuration
Studio adoption backlog. It does not accept claims that every named screen, attribute or module is complete.
Before a surface enters Build, its row must be reconciled against the assembled route, frontend handler,
API, authorization, tenant boundary, service, database, event path, audit and tests.

Inventory states used below:

- **Routed:** a matching assembled Next.js route exists; this does not prove the full outcome.
- **Combined:** capability appears within a broader routed workbench rather than as the named standalone screen.
- **Inventory candidate:** named in the supplied inventory but no matching assembled route has yet been established.
- **Adapter pending:** the module screen may exist, but it does not yet consume the canonical Configuration Studio manifest.

All rows are Adapter pending unless a later module certification explicitly proves otherwise. Tenant-profile
and tenant-owned applications are the current reference adapters; they do not certify the module surfaces below.

## 2. Standard screen experience

Every adopted screen follows this interaction:

```text
Open operational screen
  -> authorized user selects Customize this page
  -> full-screen three-pane Studio opens for the exact surface key
  -> left: allowlisted palette and sections
  -> centre: resolved screen preview
  -> right: field/component inspector and policy
  -> save draft -> submit -> independent approval -> publish -> activate
  -> explicit Return to <origin screen>
  -> operational screen reloads the active manifest
```

Draft, submitted, approved and merely published versions do not change the operational screen. Only an
activation matching tenant, environment, cohort, role and surface may change presentation or expose new
extension fields. Exit preserves a saved draft; abandoning requires an explicit confirmation.

Preview uses isolated, visibly labelled preview records by default. A real record may be used only through
an explicit **Preview with this record** action with normal object authorization, server-side masking and a
read-only snapshot. Studio never silently copies customer data into draft metadata or package exports.

## 3. Configuration boundary applied to every screen

The module owns identifiers, tenant scope, relationships, money, quantities, state machines, authorization,
approval separation, audit identity, hashes, provider receipts and immutable snapshots. Studio may configure:

- labels, help text, approved localization and display formatting;
- placement of declared core fields within module-owned slots, when the module permits movement;
- optional extension fields and sections;
- declared list columns, saved filters, sorting and search projections;
- conditional visibility/requiredness that cannot weaken a coded invariant;
- role-based read/write/mask/export presentation policy bounded by server permissions;
- approved templates, views and notification presentation settings; and
- safe policy parameters only where the owning module registers a typed policy contract.

“Locked” means semantic identity, type, requiredness, authorization relevance and lifecycle behavior cannot
be changed. A module may separately allow a locked field to be repositioned or hidden for a role only when
the server contract says the field is not required for that operation.

## 4. Screen-level plan

### 4.1 Accounts Receivable — WI-OI-019 / WI-OI-035

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 1A Client list — `ar.customer.list` | Routed: `/ar/customers` | Account identity, status, currency and calculated invoiced/paid/outstanding balances | Visible optional columns, order, saved filters, search fields, badges and non-financial customer attributes | List re-resolves columns; calculations and tenant filters stay coded |
| 1B Client detail — `ar.customer.detail` | Routed | Customer identity, legal/tax status, currency and balance summaries; invoice relation | Optional profile sections, classified attributes and related-panel placement | Detail renders active extension values; financial history is unchanged |
| 1C Client contacts — `ar.customer.contact.list-edit` | Combined with customer detail | Contact identity, customer ownership, primary-contact uniqueness and communication consent | Optional non-secret contact metadata, list columns and section layout | New/edit contact UI renders validated extensions |
| 1D Invoice list — `ar.invoice.list` | Routed: `/ar/invoices` | Number, status, money, dates, customer, family/subscription/source links | Optional snapshotted metadata columns, views and filters | Only permitted extensions appear; totals/status remain authoritative |
| 1E Invoice detail — `ar.invoice.detail` | Routed: `/ar/invoices/[invoiceId]` | Issued invoice, lines, payments, void history and accounting receipts are immutable/domain-owned | Read-only extension sections, related-panel order and disclosure-controlled fields | Existing invoices render their pinned version, never the latest definition blindly |
| 1F Invoice draft — `ar.invoice_draft.create-edit` | Routed: `/ar/invoices/new` plus draft edit surfaces | Customer, currency, dates, lines, quantity, unit amount, tax basis, discounts, totals and issue transition | Optional non-financial fields such as customer PO reference; approved sections and help text | Activated manifest appears on future/editable drafts; values persist with checksum |
| 1G Billable source records — `ar.billable_source.list-detail` | Inventory candidate | Source identity/version, eligibility, amount/currency, allocation and billed state | Source-specific descriptive attributes, views, filters and evidence panels | Does not change eligibility, price or invoice allocation logic |
| 1H Payment transaction log — `ar.payment.list-detail` | Inventory candidate | Provider receipt, transaction identity, money, status, failure and reconciliation | Columns, filters, masked reference metadata and evidence layout | Provider truth and reconciliation remain read-only |
| AR overview — `ar.dashboard` | Routed: `/ar`; omitted from supplied screen numbering | Authoritative customer/draft/issued/outstanding summaries and freshness | Widget layout, filters and navigation presentation | Summary formulas and balances remain coded |
| AR aging — `ar.aging` | Routed: `/ar/aging`; omitted from supplied screen numbering | Invoice/customer, aging bucket, due amount/date and reconciliation state | Columns, filters, grouping and display thresholds | Aging calculation and source balances remain authoritative |

AR adapter exit: canonical Studio is the only definition authority; draft values are server-validated and
stored atomically; issue copies allowed values plus manifest identity into an immutable invoice snapshot.

### 4.2 Spend Management and AP — WI-OI-020

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 2A Supplier list — `ap.supplier.list` | Combined: `/spend`, `/ap` | Supplier identity, status, environment and tenant | Columns, filters, classifications and optional supplier metadata | List presentation changes only |
| 2B Supplier detail — `ap.supplier.detail` | Combined | Supplier ownership plus PO/invoice/match relations | Profile sections, evidence links and optional attributes | Relations remain service-derived |
| 2C Purchase-order list — `ap.purchase_order.list` | Combined | PO identity, supplier, currency, total, status and order date | Columns, filters and non-financial coding dimensions | No amount/status recalculation |
| 2D Purchase-order detail — `ap.purchase_order.detail` | Combined | Line quantities/prices/totals and receipt/invoice relations | Optional header/line descriptive attributes and panel layout | Values validate without changing ordered value |
| 2E Goods-receipt list/detail — `ap.goods_receipt.list-detail` | Combined | Receipt/PO identity, received quantity/date and evidence | Inspection metadata, columns and attachment slots | Match quantity remains coded |
| 2F Supplier-invoice list — `ap.supplier_invoice.list` | Combined | Invoice identity, supplier/PO, currency, tax, total and workflow status | Views, filters and optional intake metadata | Matching/payment state unaffected |
| 2G Supplier-invoice detail — `ap.supplier_invoice.detail` | Combined | Invoice lines, tolerances used, findings and money | Intake/review sections and evidence metadata | Historical evaluation stays pinned |
| 2H Three-way-match evaluation — `ap.match_evaluation.detail` | Routed/combined: `/ap` | PO/receipt/invoice references, deterministic findings and resolution | Finding presentation, reviewer notes and saved views | Cannot alter the evaluation result |
| 2I AP rules configuration — `ap.policy.author` | Combined | Typed rule schema, risk, approval count, self-approval prohibition and financial limits | Values within registered policy bounds, descriptions and test cases | Separate rule lifecycle/version activation applies |
| 2J Expense-claim list — `spend.expense_claim.list` | Combined: `/spend` | Claim identity, claimant, amount/currency, pass-through and status | Columns, filters and non-financial dimensions | Reimbursement state stays coded |
| 2K Expense-claim detail — `spend.expense_claim.detail` | Combined | Amount, claimant, receipt provenance and approval/reimbursement history | Review layout, optional project context and evidence fields | Cannot approve or reimburse through a form expression |
| 2L Budget list — `spend.budget.list` | Combined | Limit, spend, currency, dates, period and status | Views, filters and optional ownership metadata | Budget arithmetic unchanged |
| 2M Budget detail — `spend.budget.detail` | Combined | Category limits/spend and claim relations | Layout, alert presentation and explanatory metadata | Threshold engine remains code-owned unless typed policy is registered |
| 2N Vendor subscription tracker — `spend.vendor_subscription.list-detail` | Combined | Vendor, amount/currency, billing cycle, renewal and status | Columns, reminders, category presentation and notes | No payment/cancellation external action |

### 4.3 Enterprise Tax Nexus — WI-OI-021

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 3A Nexus configuration list — `tax.nexus.list` | Routed: `/tax`, `/tax/rates`, `/tax/monitor` | Jurisdiction, tax type, rate version/effective dates and status | Columns, filters, labels and optional evidence metadata | Cannot invent or override an unsupported rate |
| 3B Tax-rule detail — `tax.rule.detail` | Routed/combined: `/tax/exemptions`, `/tax/audit` | Nexus identity, registrations, exemptions and effective policy | Evidence sections, notes schema and approved typed parameters | Tax decision remains versioned and server-calculated |
| 3C Multi-jurisdiction view — `tax.exposure.dashboard` | Routed/combined | Authoritative exposure aggregation and effective rates | Widgets, layout, filters and display thresholds | Missing/stale jurisdiction data remains visible and blocking |

### 4.4 Multi-Currency and Treasury — WI-OI-022

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 4A Exchange-rate table — `treasury.fx_rate.list` | Combined: `/currency` | Currency pair, exact rate, source, effective time and provenance | Columns, filters, freshness presentation and optional source metadata | Cannot edit provider truth through layout configuration |
| 4B Chart of accounts — `ledger.account.list-detail` | Inventory candidate | Account code/type/currency/hierarchy and activation state | Display groups, optional reporting attributes and views | Posting semantics remain code-owned |
| 4C Journal-entry list — `ledger.journal.list` | Inventory candidate | Entry identity/date/status, balanced totals, currency and poster | Columns, filters and evidence badges | No configurable debit/credit mutation |
| 4D Journal-entry detail — `ledger.journal.detail` | Inventory candidate | Posted lines, debit/credit equality and reference | Read-only section layout and optional coding dimensions allowed before posting | Posted versions remain immutable |
| 4E Integrity seals — `ledger.integrity.list-detail` | Inventory candidate | Sequence, previous/current hash, sealed time/actor | Filters, explanatory help and verifier status display | Hash material and verification cannot be configured |

### 4.5 Universal Data Studio — WI-OI-023

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 5A Source connections — `data.connection.list` | Routed: `/connections` | Connector type, environment, credential reference and health | Columns, filters, labels and non-secret metadata | Never exposes raw credentials or fabricates Ready |
| 5B Connection detail — `data.connection.detail` | Routed: `/connections/[connectionId]` | Endpoint identity, secret reference, TLS and sync truth | Provider-registered optional properties and panel layout | Requires provider contract validation |
| 5C Data-contract list — `data.contract.list` | Routed: `/data-contracts` | Contract identity/version/status/owner | Views, classifications and descriptive metadata | Version lifecycle remains governed |
| 5D Contract-version detail — `data.contract_version.detail` | Combined | Schema snapshot, checksum, breaking-change result and approval | Diff layout, annotations and reviewer evidence | Cannot suppress breaking findings |
| 5E Ingestion streams — `data.stream.list-detail` | Combined | Source/target, mode, checkpoint, schedule execution and counts | Registered schedule parameters, views and alert presentation | Execution/retry remains service-owned |
| 5F Source-schema history — `data.source_schema.history` | Combined | Captured schema/version/diff/provenance | Column presentation and annotations | Historical snapshots remain immutable |
| 5G File-import queue — `data.import.list-detail` | Combined | File identity, source, status, counts and errors | Mapping UI, columns and review layout | Parser/validation cannot be bypassed |
| 5H Source-event log — `data.event.list-detail` | Combined | Event/source identity, payload classification, status, retries and error | Masked views, filters and evidence layout | Payload access remains policy-controlled |

### 4.6 Universal Rule Pro — WI-OI-024 / WI-OI-034

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 6A Rule list — `rules.definition.list` | Routed: `/rules` | Rule identity, lifecycle and active version | Columns, filters, labels and tags | Cannot change active rule through list layout |
| 6B Visual rule studio — `rules.definition.author` | Routed: `/rules/studio` | Typed AST, allowlisted facts/operators/actions and limits | Canvas layout, registered nodes, descriptions and test cases | Rule publish/activation remains separate and pinned |
| 6C Rule-version history — `rules.version.list-detail` | Combined | Version AST/action/checksum/publisher | Diff presentation and annotations | Versions immutable |
| 6D Evaluation log — `rules.evaluation.list-detail` | Combined | Input snapshot authorization, result, action and timing | Columns, filters, masking and explanation layout | Cannot rewrite evaluation evidence |

### 4.7 Workflow Studio — WI-OI-017 / WI-OI-025

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 7A Pipeline list — `workflow.definition.list` | Routed: `/workflows` | Workflow identity, status, version and measured runs | Columns, filters, tags and summaries | Active version unchanged by presentation activation |
| 7B Workflow designer — `workflow.definition.author` | Routed: `/workflows/[wfId]/canvas`, `/workflows/new` | Allowlisted node contracts, edges, retries, waits, approvals and actions | Canvas arrangement and registered node property forms | Separate workflow validation/publish lifecycle |
| 7C Workflow history — `workflow.version.list-detail` | Combined | Immutable graph/version/checksum/publisher | Diff and annotation layout | No mutation of historical version |
| 7D Workflow runs — `workflow.run.list` | Routed: `/runs` | Run identity/version/status/timing/error | Columns, filters, SLA badges and saved views | Runtime truth remains execution-owned |
| 7E Run detail — `workflow.run.detail` | Routed: `/runs/[runId]` | Step inputs/outputs subject to masking, retry history and timing | Trace layout, collapsed sections and annotations | Cannot retry/cancel via arbitrary configuration |

### 4.8 Connector Hub — WI-OI-026

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 8A Connector catalogue — `connector.catalog.list-detail` | Routed/combined: `/connections` | Connector type/version, supported operations and credential schema | Cards, filters and provider-supplied descriptive properties | Catalogue eligibility stays code-owned |
| 8B Connector instances — `connector.instance.list-detail` | Routed/combined | Environment, state, health and secret references | Columns, provider-registered properties and monitoring layout | Activation never asserts provider health |
| 8C Attempt log — `connector.attempt.list-detail` | Combined | Operation, direction, response, timing, retry and masked payload | Views, filters and evidence layout | Receipt remains immutable |
| 8D Checkpoints — `connector.checkpoint.list-detail` | Combined | Cursor/value, source and update time | Read-only formatting and filters | Checkpoint mutation remains worker-owned |
| 8E Credential references — `connector.credential.list-detail` | Routed: `/connections/credentials` | Alias/type/reference, expiry and rotation; no raw secret | Provider-specific non-secret metadata and layout | Sensitive values remain non-returning |

### 4.9 Recovery and operational controls — WI-OI-027 plus shared controls

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 9A Business-action queue — `action.queue.list` | Routed: `/actions` | Action/risk/status/proposer/approver and execution identity | Columns, filters, assignment presentation and tags | Cannot approve or execute via form expression |
| 9B Action detail — `action.detail` | Combined | Input/output evidence, approval and execution receipts | Section layout, masking and annotations | External outcome remains reconciled truth |
| 9C Approval panel — `action.approval.decide` | Combined | Approver authority, decision, reason and no-self-approval | Help text and supporting evidence layout | Decision endpoint retains all authority |
| 9D Exception list — `exception.list` | Routed: `/exceptions` | Exception identity/kind/status/source/assignee | Columns, filters, SLA presentation and saved views | No status fabrication |
| 9E Exception recovery — `exception.detail-recover` | Combined | Recovery command, idempotency, actor and replay link | Evidence sections and registered recovery forms | Only allowlisted commands execute |
| 9F Evidence bundle — `evidence.bundle.detail` | Combined | Bundle/action/source/capture identity | Layout, labels and disclosure policy | Evidence content remains immutable/authorized |
| 9G Value ledger — `value.definition-event.list-detail` | Routed: `/value` | Formula/version, amount/currency, source lineage and publisher | Views, descriptions and display widgets | Configuration cannot create unverified value |
| 9H AP value assumptions — `value.ap_assumption.author` | Combined | Typed units, effective version and approval | Registered bounded parameters and explanatory text | New versions require governed approval |
| Recovery Studio — `recovery.case.dashboard-detail` | Routed: `/recovery`; omitted from supplied screen numbering | Detector/source/case identity, evidence, status, action receipts and verified value | Review layout, filters, supervised playbook selection and annotations | Detection, action and value remain source-linked and separately governed |

### 4.10 Tenant, access and platform control — WI-OI-013 / WI-OI-028

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 10A Tenant list — `platform.tenant.list` | Routed: `/platform-admin` | Tenant identity/status/plan/region and platform authority | Columns, filters and operator-only annotations | Never broadens platform access |
| 10B Tenant detail — `platform.tenant.detail` | Combined | Tenant lifecycle, environments and region | Branding/profile sections and approved support metadata | Lifecycle commands remain audited APIs |
| 10C Tenant settings — `tenant.settings.edit` | Routed: `/settings` | Tenant identity, security enforcement and entitlement facts | Branding, localization and registered bounded policy parameters | Cannot weaken security minimums |
| 10D Members — `tenant.member.list-detail` | Routed/combined: `/settings` | User identity/status, memberships and role assignments | Columns, filters and optional member profile fields | Role changes remain IAM commands |
| 10E Roles and permissions — `tenant.role.list-edit` | Routed/combined | Permission catalogue, system roles and assignment authority | Role descriptions and views; custom role composition within grant ceiling | Cannot invent permissions or exceed actor grants |
| 10F User groups — `tenant.group.list-edit` | Combined | Group identity/membership and permission references | Descriptions, columns and optional metadata | Membership changes remain authorized commands |
| 10G Module entitlements — `tenant.entitlement.list-detail` | Combined: `/modules`, `/marketplace` | Eligible modules, enabled state, limits and grant actor | Presentation and allowed request metadata | Cannot activate contained/unentitled modules |
| 10H Tenant export — `tenant.export.list-detail` | Combined: `/settings` | Requester, status, signed artifact, expiry and data scope | Columns, filters and approved export-format options | Export authorization and worker remain code-owned |
| 10I Platform roles — `platform.role_assignment.list-edit` | Routed: `/platform-admin/users` | Platform role key, grantor, expiry and global authority | Views and annotations only | No tenant Studio control over platform roles |

### 4.11 Identity and IAM — WI-OI-013

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 11A User profile — `identity.profile.edit` | Routed: `/settings/profile` | User identity/status and verified contact facts | Optional non-security profile attributes, labels and layout | Verification/status remain IAM-owned |
| 11B Security settings — `identity.security.manage` | Routed | MFA/password/recovery mechanics and minimum policy | Help/layout and stronger tenant-selectable registered options | Cannot disable platform security floor |
| 11C Sessions — `identity.session.list-revoke` | Combined | Session identity, expiry, device/IP evidence and current-session rules | Columns, filters and display formatting | Revocation stays explicit IAM command |
| 11D External identities — `identity.external.list-revoke` | Combined | Provider binding and verified subject | Layout and provider labels | Cannot edit provider subject identifiers |
| 11E OIDC configuration — `identity.oidc.manage` | Combined: `/settings` | Issuer, client binding, secret reference, PKCE/state and status | Claim mappings/scopes within allowlisted schema and help text | Activation requires validation; secrets never returned |
| 11F OTP log — `identity.otp.audit` | Inventory candidate | Purpose, expiry, use state and delivery evidence; token secret excluded | Operator filters and masked display | No resend/use through generic metadata action |
| 11G Invites — `identity.invite.list-create` | Combined | Token secrecy, email, role ceiling, inviter and expiry | Message template selection and optional onboarding metadata | Acceptance/role grant remain IAM-owned |

### 4.12 E-Signature

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 12A Envelope list — `esign.envelope.list` | Combined: `/esign` | Envelope identity/status/recipient count and timestamps | Columns, filters, labels and optional case metadata | Signature state unchanged |
| 12B Envelope detail — `esign.envelope.detail` | Combined | Document hash/certificate/artifact and recipient evidence | Read-only section layout and non-evidentiary metadata | Completed evidence remains immutable |
| 12C Viewer and placement — `esign.envelope.prepare-sign` | Combined | Document bytes/hash, recipient identity, required signature fields and signing ceremony | Registered field palette, visual placement and help text | New field types require code/security review |

### 4.13 Support and Service Desk

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 13A Ticket queue — `support.ticket.list` | Inventory candidate | Ticket identity, requester, priority, status, assignment and SLA | Columns, filters, queues and optional intake attributes | SLA/status logic remains service-owned |
| 13B Ticket thread — `support.ticket.detail` | Inventory candidate | Message author/role/time, visibility and audit | Side panels, custom case attributes and response layout | Internal-note access cannot be weakened |
| 13C Knowledge categories — `support.knowledge_category.list` | Inventory candidate | Category identity/slug/publish policy | Layout, optional taxonomy metadata and ordering | Slug uniqueness remains coded |
| 13D Knowledge article — `support.knowledge_article.edit-read` | Inventory candidate | Article identity/version/publish status and author | Structured content blocks, metadata and layout | Sanitization/publish lifecycle remains code-owned |

### 4.14 Subscription and billing — WI-OI-015 boundary

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 14A Plan catalogue — `billing.plan.list-detail` | Inventory candidate / marketplace overlap | Plan identity/status/interval and entitlement features | Marketing copy, display grouping and non-binding metadata | Cannot alter executable entitlements casually |
| 14B Price list — `billing.price.list-detail` | Inventory candidate | Exact currency/amount/interval/version | Display formatting and approved descriptive attributes | Pricing version remains financial truth |
| 14C Subscription list — `billing.subscription.list` | Inventory candidate | Tenant, plan, status, periods and cancellation facts | Columns, filters and support annotations | No lifecycle mutation through layout |
| 14D Subscription detail — `billing.subscription.detail` | Inventory candidate | Items, quantities, invoices and lifecycle | Panel order and non-financial metadata | Provider/billing reconciliation remains authoritative |
| 14E Checkout — `billing.checkout.create` | Inventory candidate | Session, price, quantity, currency, expiry and payment authorization | Branding, consent copy and allowed collection fields | Amount and payment action remain server/provider-owned |

### 4.15 Product catalogue and orders

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 15A Product catalogue — `commerce.product.list-edit` | Inventory candidate | SKU, price/currency, tax category, unit and active state | Descriptions, categories, media references and optional attributes | Price/tax semantics remain typed |
| 15B Order list — `commerce.order.list` | Inventory candidate | Order identity/customer, totals/currency/status | Columns, filters and optional channel metadata | No refund/completion mutation |
| 15C Order detail — `commerce.order.detail` | Inventory candidate | Line SKU/quantity/amount and total/status | Layout and snapshotted descriptive metadata | Historical order values remain pinned |

### 4.16 Document workbench — WI-OI-033

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 16A Managed documents — `document.list` | Routed/combined: `/scanner`, `/solutions/day-one` | Object/storage identity, uploader, class, status and retention | Columns, filters and classified intake metadata | Cannot expose storage keys as downloadable authority |
| 16B OCR job — `document.extraction.detail` | Combined | Document/version, provider result, confidence, timing and error | Review layout, registered target mappings and thresholds | Extracted data remains unverified until explicit review |
| 16C Viewer — `document.verify` | Combined | Original immutable artifact, OCR coordinates and correction audit | Panel layout and registered verification fields | Corrections create evidence; never overwrite source bytes |

### 4.17 Forms Engine

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 17A Form schemas — `forms.schema.list` | Combined: `/configuration` | Schema identity/version/status/owner | Columns, filters and tags | Canonical Configuration Studio lifecycle replaces parallel authorities |
| 17B Form builder — `forms.schema.author` | Routed: `/configuration` | Stable keys, component registry, security limits and checksums | Fields, sections, conditions and approved components | Activation affects only registered consumers |
| 17C Submissions — `forms.submission.list` | Inventory candidate / tenant-app overlap | Schema version, submitter, time, values and review status | Columns, filters and masking | Submission values remain version-bound |
| 17D Submission review — `forms.submission.detail-review` | Inventory candidate | Submitted snapshot, reviewer and decision | Review layout and annotations | Approval remains explicit governed command |

### 4.18 Geospatial Studio — WI-OI-029

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 18A Geofence zones — `geo.zone.list-detail` | Combined: `/maps` | Coordinates, radius, source/tenant and active state | Columns, styles within tokens and optional zone metadata | Spatial validation stays coded |
| 18B Map view — `geo.map.view` | Routed: `/maps` | Authorized layers, coordinates and event/source truth | Layer visibility/order, safe symbology, panels and filters | Empty tenant remains empty; no invented pings |
| 18C Zone detail — `geo.zone.detail` | Combined | Zone geometry and entry/exit event identity | Event columns, filters and contextual metadata | Historical events remain immutable |

### 4.19 Execution monitor — WI-OI-025

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 19A All-runs dashboard — `execution.dashboard` | Routed: `/runs` | Counts, success rate, duration and failure aggregation | Widget layout, saved filters and display thresholds | Metric formulas remain governed |
| 19B Step trace — `execution.run.detail` | Routed: `/runs/[runId]` | Node/version, status, snapshots, timing, retry and error | Trace layout, masking and annotations | Execution evidence cannot be edited |

### 4.20 Operational Intelligence and Analytics — WI-OI-023 boundary

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 20A Analytics Studio — `analytics.dashboard.author-view` | Routed: `/analytics` | Metric identity, source lineage, aggregation and classification | Dashboard layout, registered dimensions, filters and visualization choice | Cannot author arbitrary SQL or unverified formulas |
| 20B Reports Studio — `report.definition.list-edit` | Routed: `/reports` | Query contract, authorization, schedule execution and recipients | Layout, registered fields, safe filters and delivery presentation | Export/query remains bounded and audited |
| 20C KPI library — `analytics.widget.catalog` | Combined | Widget type/version, metric compatibility and accessibility contract | Placement, thresholds and style tokens | Formula and source stay code/registry-owned |

### 4.21 OAuth Studio — WI-OI-032

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 21A OAuth applications — `oauth.application.list-edit` | Routed: `/connections/oauth-studio` | Provider, redirect URI, client identity and secret reference | Provider-registered scopes/mappings, labels and layout | Secret never enters manifest/export |
| 21B Handshake — `oauth.handshake.execute` | Routed/combined | Authorization endpoint, PKCE, state, callback and token-vault write | Consent/help presentation and provider options | External redirect remains code-owned |
| 21C Token health — `oauth.credential_health.list` | Combined | Expiry/use/refresh/error facts | Columns, filters and alerts | Cannot claim healthy without provider evidence |

### 4.22 Real-time chat and AI copilot

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 22A Channel list — `chat.channel.list` | Inventory candidate | Channel identity/type/membership and unread calculation | Columns, grouping and optional channel metadata | Membership visibility remains authorized |
| 22B Message thread — `chat.message.thread` | Inventory candidate | Sender, content/version, deletion state, model usage and citations | Layout, safe composer fields and display policy | AI configuration cannot bypass evidence/authorization |

### 4.23 Fraud detection

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 23A Assessment log — `fraud.assessment.list-detail` | Inventory candidate | Entity reference, score/level, triggered rule versions and review decision | Columns, filters, reviewer annotations and explanation layout | Score/rule result remains immutable evidence |

### 4.24 Communications and TextFly

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 24A Notification log — `communications.notification.list-detail` | Routed/combined: `/communications` | Channel, recipient authorization, status, provider receipt and failure | Columns, filters and masked contextual metadata | Cannot mark delivered without receipt |
| 24B Template library — `communications.template.list-edit` | Combined | Template identity/version, allowed variables, channel and sanitization | Subject/body within safe template grammar, locale variants and branding | Publish lifecycle pins variable contract |
| 24C Webhook log — `communications.webhook.list-detail` | Combined | Endpoint reference, event, payload hash, response and retry | Columns, masking and evidence layout | Endpoint/secret/action policy stay connector-owned |

### 4.25 Audit and compliance

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 25A Audit log — `audit.entry.list-detail` | Inventory candidate / platform overlap | Tenant, actor, action, resource, before/after, outcome, time and integrity material | Authorized saved views, columns and masking only | Audit records are immutable and cannot be hidden from required auditors |
| 25B Outbox monitor — `outbox.event.list-detail` | Combined: `/platform-admin/dlq` | Event identity/type/aggregate/payload/status/retry | Filters, columns, masking and operator annotations | Replay remains explicit idempotent operator command |

### 4.26 Retention and privacy

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 26A Retention policies — `privacy.retention_policy.list-edit` | Combined: `/settings` | Entity scope, legal basis, minimum/maximum bounds and effective version | Values within registered policy bounds and explanatory metadata | Cannot weaken holds or mandatory retention |
| 26B Execution log — `privacy.retention_run.list-detail` | Inventory candidate | Policy version, counts, outcome and error | Columns, filters and evidence layout | History immutable |
| 26C Retention holds — `privacy.hold.list-detail` | Inventory candidate | Entity/object scope, reason, actor and release authority | Views and supporting evidence metadata | Hold/release remains separately authorized |

### 4.27 Health and observability — WI-OI-007

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 27A Health dashboard — `observability.health.dashboard` | Routed/combined: `/platform-admin`, `/platform-admin/infra` | Measured service/database/queue/cache/error facts | Widget layout, thresholds within SLO policy and filters | Cannot replace missing telemetry with green state |
| 27B Metrics explorer — `observability.metric.explore` | Combined | Metric/label/value/time provenance and query bounds | Saved queries from allowlisted metrics and visualization | No arbitrary backend query |
| 27C Trace viewer — `observability.trace.detail` | Combined | Trace/span identity, service, timing, status and classified attributes | Layout, filters and redaction policy | Trace evidence remains immutable |

### 4.28 Solution packs — WI-OI-016 / WI-OI-031

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 28A Pack catalogue — `solution_pack.catalog` | Routed: `/solutions`, `/marketplace` | Pack identity/version/dependencies/readiness and publisher | Catalogue presentation, descriptions and approved parameters | Cannot promote contained/unaccepted capabilities |
| 28B Deployment binding — `solution_pack.deployment.detail` | Combined | Tenant/environment, exact package versions/checksums and status | Environment bindings and approved parameter forms | Deployment remains validated/idempotent |
| 28C Autonomous run log — `solution_pack.run.list-detail` | Combined | Trigger, outcome, proposed/approved/executed actions and timing | Views, filters and evidence layout | Value/action truth remains source-linked |

### 4.29 Universal Configuration Studio — WI-OI-039

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| 29A Designer — `configuration.definition.author` | Routed: `/configuration` | Registry identity, stable keys, component versions, limits and permissions | Draft fields, sections, layout and bounded conditions | Saves draft only; no runtime effect |
| 29B Review — `configuration.change_set.review` | Combined in `/configuration` | Author, checksum, diff, impact and separation of duties | Reviewer reason/annotations only | Approval does not activate |
| 29C Published history — `configuration.version.list-detail` | Combined | Immutable version/checksum/publisher and activation history | Filters and diff presentation | Publish alone has no runtime effect |
| 29D Tenant applications — `configuration.application.list` | Routed through dynamic `/apps/[appKey]` plus Studio | Entity, active version, checksum and record/stale counts | Navigation label/icon and declared views | Only active compatible version becomes available |
| 29E Dynamic record list — `configuration.record.list` | Routed: `/apps/[appKey]` | Tenant/entity/version, authorization and record identity | Manifest columns, search, filters and sort | Reload uses active list manifest |
| 29F Dynamic record detail — `configuration.record.detail` | Combined | Record identity/version/checksum and classified values | Field layout and masking bounded by permission | Stale state remains explicit |
| 29G Template catalogue — `configuration.template.list-edit` | Combined | Manifest/value checksums, source clone and optimistic version | Template values allowed by active manifest | Stale template cannot silently write incompatible data |
| 29H Saved filters — `configuration.saved_filter.list-edit` | Combined | Owner/entity and bounded query fields | Name and allowed filter/sort/search selections | Cannot expand data authorization |

### 4.30 Physical Operations and CMMS — WI-OI-038 reconciliation addition

The supplied numbered inventory mentions CMMS only as an adapter gap, but the assembled application has
fourteen CMMS routes. They are included here so “entire application” does not silently exclude them. These
are route findings, not accepted CMMS requirements or production certification.

| Screen / stable surface | Current assembly | Locked core and invariants | Studio-controlled extension | Activation result |
| --- | --- | --- | --- | --- |
| CMMS overview — `cmms.dashboard` | Routed: `/cmms` | Authoritative asset/work-order/maintenance counts and state | Widget layout, filters and presentation thresholds | Cannot display fabricated operational status |
| Assets — `cmms.asset.list-detail` | Routed: `/cmms/assets` | Asset identity, hierarchy, criticality, status, location and lifecycle | Optional asset attributes, sections, columns and views | Asset state/hierarchy stays domain-owned |
| Work orders — `cmms.work_order.list-detail` | Routed: `/cmms/work-orders` | Work-order identity/status/asset, priority, assignment, labor/parts and completion evidence | Intake fields, checklist sections, columns and views | Status transitions and cost arithmetic remain coded |
| Preventive schedules — `cmms.schedule.list-detail` | Routed: `/cmms/schedules` | Schedule identity, trigger, asset, recurrence/version and active state | Registered trigger parameters, checklist template and layout | Scheduler semantics remain service-owned |
| Maintenance calendar — `cmms.calendar` | Routed: `/cmms/calendar` | Work-order/schedule dates, assignments and status | View mode, safe colors, filters and visible metadata | Does not reschedule records through presentation configuration |
| Inventory and parts — `cmms.inventory.list-detail` | Routed: `/cmms/inventory` | Part identity, quantity, reservation, reorder and valuation facts | Columns, filters, warehouse metadata and labels | Stock movement and cost stay transactional |
| Purchase orders — `cmms.purchase_order.list-detail` | Routed: `/cmms/purchase-orders` | PO identity/vendor, amount/currency, status and received state | Optional procurement metadata, layout and views | Approval/receipt/payment remain code-owned |
| Vendors — `cmms.vendor.list-detail` | Routed: `/cmms/vendors` | Vendor identity/status and authoritative contact/commercial relationship | Profile extensions, columns and classifications | Does not grant supplier/payment authority |
| Meters — `cmms.meter.list-detail` | Routed: `/cmms/meters` | Meter identity/unit, asset/source, reading/time and rollover rules | Display precision, thresholds within typed bounds and optional reading context | Reading validation and trigger evaluation remain coded |
| People — `cmms.people.list-detail` | Routed: `/cmms/people` | Worker identity, tenant membership, qualification and assignment authority | Optional technician profile fields, columns and filters | IAM and qualification enforcement cannot be weakened |
| Service requests — `cmms.request.list-detail` | Routed: `/cmms/requests` | Request identity/requester, asset/location, priority and state | Intake extensions, routing metadata and list views | Work-order conversion remains explicit command |
| Request portal — `cmms.request.create` | Routed: `/cmms/requests/portal` | Requester/tenant context, required problem/location facts and abuse controls | Approved intake fields, help, sections and conditional questions | Public/requester scope remains server-authorized |
| Workload — `cmms.workload.dashboard` | Routed: `/cmms/workload` | Assignment/capacity/work-order facts and calculation | Filters, grouping, widgets and display thresholds | Cannot change assignments or capacity truth implicitly |
| Floor view — `cmms.floor.view` | Routed: `/cmms/floor` | Asset/location identity and operational telemetry provenance | Layer visibility, safe symbology, filters and detail panels | Empty/stale telemetry remains explicit |

CMMS remains behind WI-OI-038 discovery and domain acceptance. These surfaces must not be registered in
the canonical Studio merely because routes exist.

### 4.31 Assembled platform screens omitted or only indirectly represented in the supplied inventory

These routed screens also require an explicit disposition during inventory reconciliation.

| Assembled screen | Proposed surface/disposition | Configuration boundary |
| --- | --- | --- |
| `/dashboard` | `platform.home.dashboard` | Widget layout and saved views over authorized, freshness-labelled facts |
| `/modules` | `platform.module_selector` | Presentation only; readiness and entitlement remain code-owned |
| `/marketplace` | `platform.marketplace.catalog` | Catalogue presentation; no activation of contained modules |
| `/master-data` and `/platform-admin/master-data` | `master_data.list-detail` / `platform.master_data.manage` | Registered reference-field presentation; authoritative codes/versioning stay governed |
| `/ontology` | `ontology.definition.list-detail` | Labels, views and approved mappings; semantic IDs/dependencies stay versioned |
| `/opportunities` | `intelligence.opportunity.list-detail` | Views and annotations over source-linked facts; no invented value |
| `/saga` | `workflow.saga.monitor` | Read-only layout/filters over durable saga/step truth; execution remains orchestrator-owned |
| `/platform-admin/dlq` | `platform.dlq.list-replay` | Filters and evidence layout; replay remains authorized/idempotent command |
| `/platform-admin/infra` | `platform.infrastructure.dashboard` | Layout and thresholds over real provider state; no fabricated health |
| `/connections/new` | `connector.instance.create` | Provider-registered properties only; secrets use credential references |
| `/connections/environments/new` | `connector.environment.create` | Approved environment metadata; tenant/region/security bounds remain coded |
| `/solutions/day-one` | `document.intake.workbench` | Intake layout and registered metadata; extraction/action truth remains governed |
| `/admin/metering` | `billing.usage.dashboard` | Views and alerts over reconciled meters; usage and price calculation stay code-owned |

Routes such as `/tax/rates`, `/tax/exemptions`, `/tax/monitor` and `/tax/audit` are already mapped to the
Tax screen family above. Connection credentials, OAuth, AR child routes, rule Studio, workflow canvases,
execution details and personal profile are likewise mapped in their owning rows.

## 5. Cross-screen implementation sequence

Each screen moves through these gates; module teams must not bulk-register all surfaces at once.

1. **Inventory reconciliation:** confirm route, user, action, fields, API, persistence and current truth status.
2. **Surface contract:** assign stable key, operations, extension slots, core-field lock policy and permissions.
3. **Read adapter:** resolve the active manifest and render coded core plus optional extensions without writes.
4. **Write adapter:** server validates extensions and commits values with the canonical record transaction.
5. **Immutable transition:** snapshot manifest/value identity when records are issued, posted, signed or completed.
6. **Projection adapter:** rebuild list/search/export projections safely after compatible activation.
7. **Studio context:** add permission-controlled Customize entry, origin return path and isolated preview fixtures.
8. **Lifecycle evidence:** prove draft has no runtime effect; activation and rollback affect only the target scope.
9. **Completeness evidence:** tenant/RBAC negatives, stale/concurrent writes, restart, migration, accessibility,
   performance, audit, telemetry and recovery.
10. **Independent acceptance:** Architecture, Security, QA, affected Domain and Product review before availability.

## 6. Delivery waves

The screen inventory is sequenced by dependency and risk:

| Wave | Screens |
| ---: | --- |
| 0 | Fix canonical surface registry and Studio response contract; finish tenant-profile reference evidence |
| 1 | AR 1A-1F, beginning with `ar.invoice_draft.create-edit`; retain 1G-1H until their domain records exist |
| 2 | Connections 8A-8E and OAuth 21A-21C against one real selected provider |
| 3 | Data Studio 5A-5H and governed source/contract projections |
| 4 | Rule screens 6A-6D, then workflow and execution screens 7A-7E and 19A-19B |
| 5 | Action/exception/evidence screens 9A-9F |
| 6 | Spend/AP screens 2A-2N |
| 7 | Tax 3A-3C and currency/ledger 4A-4E where AR/AP claims require them |
| 8 | Tenant/IAM screens 10A-10I and 11A-11G, limited to safe presentation/profile extensions |
| 9 | CMMS route surfaces in section 4.30 under WI-OI-038 after accepted requirements and domain inventory |
| 10 | Recovery/value, analytics/reports, documents and communications: 9G-9H, 16A-16C, 20A-20C, 24A-24C |
| 11 | E-sign, geospatial, audit/privacy/observability and solution packs: 12A-12C, 18A-18C, 25A-28C |
| 12 | Inventory-candidate products requiring accepted ownership: support, subscription billing, orders, chat and fraud |
| 13 | Forms/Configuration Studio self-hosting cleanup: 17A-17D and 29A-29H after parallel schema authorities converge |

## 7. Immediate blockers to this plan

1. The assembled frontend currently has a local `/api/control/configuration/surfaces` registry that conflicts
   with the authenticated control-plane registry and returns a different response shape.
2. The control plane currently accepts only tenant-profile and tenant-application base surfaces; claimed AR
   frontend entries are not authoritative registrations.
3. AR has parallel `form_definitions` and `custom_field_definitions` persistence in addition to the canonical
   Configuration Studio models. Ownership and migration/convergence must be decided before AR adoption.
4. Current AR create/update/read/issue APIs do not carry canonical manifest version/checksum and extension
   values through the full transaction and immutable issue snapshot.
5. The supplied inventory includes many screens without established assembled routes or complete vertical
   slices. Each remains an inventory candidate, not a production claim.

## 8. Definition of Done for one screen

A screen is adopted only when an authorized user can enter Studio from that screen, see all coded core fields
with truthful lock reasons, configure only allowed extensions, preview every supported role/state/breakpoint,
complete the governed lifecycle, activate and roll back the exact surface, and return to an operational screen
that reads/writes through the server adapter. Values must survive refresh/restart, preserve tenant and object
authorization, carry schema identity, remain auditable and preserve historical immutable records.
