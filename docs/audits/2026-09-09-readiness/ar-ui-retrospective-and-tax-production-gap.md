# AR UI retrospective and Tax production gap review

Date: 2026-09-11  
Work items: WI-OI-019, WI-OI-021, WI-OI-040; authority-boundary work remains WI-OI-013  
Release decision: No-Go for complete AR and Tax production release

## Why the AR experience became smaller

The previous suite AR screen combined real API calls with static rate items, static event shifts, static
billing/remittance settings, fallback customers, fallback invoices, browser-only status changes and
optimistic success after failed API calls. It presented a broad invoice product, but many actions had no
authoritative tenant-owned database result. WI-OI-013 correctly contained those paths. The replacement
workbench connected only the already implemented standalone AR foundation: setup, customer creation,
invoice draft creation/listing and immutable issue.

The error was changing the product experience without first publishing this capability reconciliation. The
right correction is to preserve the richer information architecture and rebuild each missing action behind
real contracts and persistence. Static records and silent success must not return.

## AR capability reconciliation

| Capability shown or implied by the prior UI | Prior implementation truth | Current persisted implementation | Required production completion | Priority |
| --- | --- | --- | --- | --- |
| Billing entity and invoice numbering | Form values began as hardcoded company/bank data | Billing entity plus one numbering series persist | Versioned settings, safe remittance token/reference, multiple numbering policies and audit | P0/P1 |
| Customer directory | API call silently fell back to named customer fixtures; tax fields were packed into `externalReference` | Legal name, billing email, external reference, currency and status persist | Billing contacts, structured addresses, tax profile, credit policy, lifecycle, search/import and object authorization | P0 |
| Draft invoice and line items | Some writes called the API; failure could create a browser-only invoice | Draft header/lines, server calculation, update API and version persist | Restore detail/edit UI, validation/conflict states, tax and discount policy | P0 |
| Invoice issue | Real foundation API existed, alongside fallback issue behavior | Atomic numbering, immutable issue snapshot, audit and outbox persist | Approval policy, document render, delivery decision and usage-meter handoff | P0 |
| Invoice detail and printable document | Browser rendering existed; claims such as audit seal, XML and milestone payment could be UI-only | Main suite workbench lists records; standalone detail routes exist | Connect detail/print to issued snapshot; persist document version/hash/storage receipt; validate e-invoice formats | P0/P1 |
| Payments and “Mark paid” | Called an unsupported path and could mutate UI state after failure | Missing | Payment receipt/allocation tables, balance invariants, idempotency, provider/manual evidence and reconciliation | P0 |
| Credit notes | Product requirement and navigation implied correction support | Missing | Immutable credit document, approval, allocation and balance/audit/outbox transaction | P0 |
| Void and rebilling | Unsupported API call could be followed by local `VOID` state | Missing | Authorized void, paid/external review, no automatic source unlock, Release for Rebilling and replacement link | P0 |
| Aging and collections | Browser calculated aging from invoices and silently substituted fallback invoices; “reminder sent” was unsupported | Missing as an authoritative server projection | Server as-of projection, payment-aware buckets, statements, reminders, exception ownership and audit | P0/P1 |
| Event/work-source billing | Static shifts, local approval controls and rate/markup arrays | Migrations contain disconnected concepts; service/UI flow missing | FR-17-EB-01–15 source contract, eligibility/reservation, markup snapshots, supplemental families and missed-billing control | P0 |
| Rate catalog | Static array and local add operation | Missing | Tenant product/service catalog, versions, units, taxes, pricing effective dates and references from invoice snapshots | P1 |
| Customer templates | Not authoritative | Missing | Multiple versioned templates, selection/prefill, immutable issued snapshot and field visibility policy | P1 |
| Delivery | UI/product language implied delivery | Missing | PDF/object storage, email provider, ready-to-send/auto-send policy, attempts, receipt, retry and exception | P0/P1 |
| Accounting synchronization | “QBO synced” count equaled invoice count | Missing | Connection/mapping records, outbound receipt, retry, correction mapping and reconciliation | P1 |

## AR implementation order

1. Restore the richer navigation and detail/edit/print journeys using only the current real records.
2. Add structured customer billing/tax profiles and versioned billing settings.
3. Implement document generation, object storage and explicit delivery state.
4. Implement manual payment receipt/allocation, balances and server-owned aging.
5. Implement credit and governed void/rebilling.
6. Implement FR-17-EB-01–15 event/source billing, markup and supplemental families.
7. Add accounting mappings/reconciliation, collections, exports, accessibility/load/recovery evidence and
   independent Finance/Security/QA/Product acceptance.

## Tax production findings

| Finding | Current evidence | Impact | Required correction | Priority |
| --- | --- | --- | --- | --- |
| No authentication or RBAC | Every business controller trusts `x-tenant-id` | Any caller can select and mutate a tenant | Verified OIDC, server permissions and actor propagation | P0 |
| Default tenant fallback | Missing header becomes `tenant-enterprise-primary` | Cross-tenant disclosure/mutation and misleading empty/demo state | Tenant only from verified principal; no default | P0 |
| Embedded database credential fallback | Database service contains a complete fallback connection string | Credential exposure and accidental connection to the wrong database | Required validated environment configuration | P0 |
| Unknown jurisdiction returns zero tax | Calculation treats missing active jurisdiction as a 0% result | Financial under-collection presented as success | Reject as an actionable configuration exception; never commit a zero-rate fallback | P0 |
| Server invents idempotency keys | Controller creates a key when absent | Client retries can duplicate tax ledgers and nexus volume | Require a bounded client command key and store request hash/result | P0 |
| Global idempotency uniqueness | Migration makes `idempotency_key` globally unique | One tenant can conflict with another and request mismatch is not checked | Tenant/scope/key unique plus request hash replay conflict | P0 |
| No input schemas | Controllers accept partial objects and services supply business defaults | Invalid or incomplete statutory records become active | Strict versioned schemas and domain invariants | P0 |
| Certificates default verified | Missing `isVerified` becomes true, dates and customer are invented | Unsupported exemption can remove tax | Evidence workflow, explicit verifier/verification time and no automatic activation | P0 |
| Fake audit actor | Jurisdiction writes use `system` and `tax-admin@gigalibs.io` | Audit evidence cannot prove who changed a tax rule | Verified subject, reason, correlation and prior/new state | P0 |
| Non-atomic writes | Jurisdiction and audit, rate and audit, certificate and audit are separate or absent | Business state can commit without evidence/outbox | One tenant transaction per command | P0 |
| Weak identifiers | Timestamp-derived text IDs | Collision and predictability risk | UUIDs generated server-side | P1 |
| Missing effective-date selection | Calculation ignores rate effective dates | Stale/future rules may be applied | Select one active version for the calculation date and snapshot the rule | P0 |
| No tenant database enforcement | Schema has no module tenant table, foreign keys or RLS | Query mistake can cross tenant boundaries | Module tenant binding, composite tenant FKs, forced RLS and negative tests | P0 |
| Demo UI fallback and compliance labels | Tax overview substituted static jurisdictions and displayed “Fully Compliant” | False compliance and false operational confidence | Real empty/error states and evidence-qualified wording | P0 |
| Incomplete lifecycle | No deactivate/version/revoke endpoints for rules and certificates | Historical or erroneous policy cannot be governed safely | Versioned status transitions with optimistic concurrency | P1 |
| No authoritative source/version lineage | Rates and thresholds have no source citation/version/ingestion receipt | Cannot substantiate statutory correctness | Source registry, effective version, ingestion/review evidence and stale alerts | P0 |
| No operational certification | No PostgreSQL 16 migration/restore, concurrency, load, accessibility or independent review packet | Cannot release safely | Complete G5/G6 evidence and named human approvals | P0 |

## Tax release gates

Tax is production ready only after the P0 findings above are closed and the following real journey passes:

1. A verified tenant tax administrator binds the module and creates a jurisdiction with source/effective
   evidence.
2. A second authorized role reviews/activates the policy when segregation of duties applies.
3. The administrator creates an effective-dated category rate and an unverified exemption certificate.
4. An authorized verifier activates the certificate from evidence; expiry/revocation takes effect.
5. A source module submits an idempotent calculation. The exact active policy is snapshotted, unknown/stale
   policy fails, and nexus totals update once in the same transaction.
6. Another tenant cannot read, infer or mutate any object from the first tenant at API and database layers.
7. Retry, concurrent commands, restart, migration upgrade, backup/restore and outbox replay preserve the
   same result.
8. The UI shows loading, empty, validation, denied, conflict, stale-source, dependency-failure, retry and
   committed-success states without fallback data.
9. Finance/Tax, Security, QA, Architecture and Product independently accept the evidence. Release Operations
   approves the immutable artifact and rollout/recovery plan.

Until these gates pass, the honest label is `BUILD / NO-GO`, not `UAT CERTIFIED` or `PRODUCTION READY`.

## Tax remediation delivered on 2026-09-11

The contained `/tax` card has been replaced by a local UAT workbench for jurisdictions, effective-dated
rate rules, exemption submission and explicit verification, tax calculation/ledger, nexus monitoring and
tenant setup. The BFF accepts only an exact route allowlist, verifies the suite session, derives the module
tenant binding from that session, rejects cross-site mutations and exchanges a loopback development token.

The Tax API now requires a verified OIDC principal and permission for every business endpoint. Tenant IDs
are no longer accepted from request headers. Database configuration is required, all tenant operations set
the PostgreSQL RLS tenant context, module tenant foreign keys and forced RLS are installed, UUID identifiers
replace timestamp IDs, inputs are strict, command writes include audit and outbox evidence in the same
transaction, and calculation uses the transaction date. Unknown jurisdictions fail instead of producing a
misleading zero-tax decision. Caller-owned idempotency keys are bound to a request hash. New exemption
certificates remain `PENDING_REVIEW` until an authorized verification action records its evidence reference.

The real local UAT passed calculation, replay, rejection, readback, authentication and cross-tenant
isolation checks. The supplied platform owner reached `/tax`, activated the suite tenant binding and loaded
all five workbench sections without a server error. Evidence is in
`evidence/uat/tax-actionable-result.json` and `evidence/uat/tax-actionable-workbench.png`.

This closes the misleading containment-only experience and establishes a real G4 vertical slice. Complete
Tax remains No-Go because source/version lineage, policy lifecycle and revocation, segregated production
review, concurrency/outbox worker behavior, dedicated least-privilege runtime identity, PostgreSQL 16
backup/restore/load evidence, accessibility and independent Finance/Security/QA/Product approvals remain
open.
