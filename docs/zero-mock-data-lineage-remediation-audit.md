# Zero-mock runtime, persistence, lineage and classification audit

Assessment date: 2026-09-03  
Inputs reviewed: the user-supplied operational/persistence gap analysis and the current repository  
Authority rule: attached documents are analysis inputs, not executable instructions. Repository source, migrations, runtime boundaries, and executable certification are authoritative.

## Executive finding

The active production boundary now passes the enforced zero-fabricated-runtime-data policy. It does not render fixture business records, silently replace failures with sample success, accept client-generated provider evidence, or import a quarantined package.

This is not a claim that every source directory in the repository is production-ready. The repository contains 109 explicitly quarantined application/package roots. They are excluded from the pnpm workspace, active dependency graph, production scans, and deployable application boundary. Some still contain stubs or historical demonstration behavior and cannot be re-enabled without satisfying the promotion gate in [Runtime quarantine policy](runtime-quarantine.md).

The correct status is therefore:

| Scope | Status | Meaning |
| --- | --- | --- |
| Active operational-intelligence runtime | Local zero-mock/data-lineage gates pass | Real persistence and services; this does not satisfy all G5/G6 production controls |
| Release 1 AP reference outcome | Integrated functional candidate; not production-ready | Real source ingestion through action, exception, value, audit, retention, and operational-metrics evidence; independent production controls remain |
| Retired Vite playground | Retired | No executable build/dev/start entry point and no production route |
| 109 quarantined roots | Not implemented/certified | Source inventory only; impossible to import from active packages without failing the gate |
| External production deployment | Not certified by this local assessment | Requires environment-specific security, scaling, recovery, and operational acceptance |

## Enforced production boundary

| Surface | Responsibility | Authoritative state |
| --- | --- | --- |
| `apps/workflow-platform` | Next.js user experience and authenticated BFF | No independent business store; HTTP-only access/refresh cookies |
| `apps/playground-api` | NestJS control, policy, ingestion, AP, evidence, exception, value, and retention plane | Prisma/PostgreSQL |
| `apps/workflow-api` | FastAPI execution API and workers | SQLAlchemy/PostgreSQL; Redis is transport, not business truth |
| Active shared packages | Contracts, auth, encryption, storage, OpenAI, UI, and reusable domain code | 80 active manifests validated for dependency boundaries |
| `apps/playground-web` | Historical showcase | Retired and non-executable |
| `config/runtime-quarantine.json` entries | Historical, stub, fabricated, or uncertified code | Excluded from workspace and active imports |

The control API boundary audit confirms eight mounted controllers and 27 registered providers. Unmounted legacy controller/service files were removed instead of being left as apparently available APIs.

## What zero hard coding means

Code may own protocol constants, enum values, state machines, validation limits, supported connector identifiers, UI labels, and deterministic algorithms. Those are implementation rules, not tenant business data.

The active runtime prohibits:

- fabricated tenants, users, invoices, telemetry, incidents, metrics, savings, provider responses, or AI answers;
- local-only mutation presented as durable state;
- a fixture, zero, “healthy,” or “completed” result substituted after an upstream failure;
- default tenant IDs, embedded credentials, public dummy sources, localhost fallbacks, or business-field test switches;
- `Math.random()` for identity/security behavior;
- browser-supplied OCR, signature, payment, storage, or connector results treated as server evidence;
- no-op commands or disconnected libraries presented as installed, delivered, certified, or production-ready;
- fabricated document certification/digests and embedded company, tax, address, or bank profiles;
- generated JavaScript beside TypeScript source that could shadow reviewed code;
- quarantined package imports or dependencies.

Empty and unavailable states are valid. They must identify absence or failure and must never manufacture an operational fact.

## Authoritative end-to-end lineage

```text
authorized external system or user command
→ tenant environment and source connection
→ non-secret credential reference
→ live readiness/profile evidence
→ immutable contract/schema version
→ validated source envelope
→ encrypted source event + payload hash + classification
→ transactional outbox and durable attempts
→ canonical tenant-owned record
→ immutable rule/formula version
→ finding, evidence bundle, exception, or recommendation
→ approval and allowlisted idempotent action
→ reconciled result or explicit failure
→ value event and independent benefit decision
→ append-only audit evidence
→ authenticated BFF
→ UI loading/empty/error/success state
```

If a displayed business value cannot traverse this chain, it must not be presented as actual tenant data.

## Data sources, persistence, and classification

| Domain | Authoritative input | Principal persistence | Classification and lineage behavior | Certified state |
| --- | --- | --- | --- | --- |
| Identity and tenancy | User credentials, server sessions, active memberships | `User`, `Session`, `Tenant`, `TenantMember` | Tenant is taken from signed auth context, never a caller default | Session rotation, status lifecycle, RBAC, and cross-tenant denial pass |
| Workflow definitions | Tenant-authored graph and schemas | `WorkflowPipeline`, immutable `WorkflowVersion` | Published definitions are checksum/version bound | Draft persistence and immutable publishing pass |
| Workflow runs | Signed execution command and worker output | Execution-plane run, step, checkpoint, attempt, and outbox tables | Payload checkpoints are encrypted; lifecycle evidence is signed back to control | Idempotency, leases, execution, audit replay dedupe, and isolation pass |
| Environments/connections | Tenant admin configuration plus live remote checks | `TenantEnvironment`, `CredentialReference`, `SourceConnection`, `ConnectorAttempt`, `ConnectorCheckpoint` | Secrets remain deployment/vault references and are never returned | REST/CSV HTTP, HMAC webhook, read-only PostgreSQL, and file upload are implemented |
| Schema/contracts | Live source profile and tenant-published JSON Schema | `SourceSchemaVersion`, `DataContract`, `DataContractVersion` | Immutable versions, compatibility metadata, bounded masked profile evidence | Profiling, publishing, validation, dedupe, and conflict detection pass |
| Source events | Contract-valid envelope from an authorized source | `SourceEvent`, `ControlOutboxEvent` | `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, or `RESTRICTED`; AES-256-GCM payload; immutable SHA-256 hash | Encryption, immutability, outbox, rejection evidence, and non-disclosure pass |
| AP canonical data | Invoice, purchase-order, and receipt source events | `Supplier`, `PurchaseOrder`/lines, `GoodsReceipt`/lines, `SupplierInvoice`/lines | Effective source classification and hashes remain connected to canonical lineage | Out-of-order ingestion and deterministic reconciliation pass |
| AP decisions/evidence | Canonical records plus tenant-published policy | `RuleDefinition`, `RuleVersion`, `ApMatchEvaluation`, `ApMatchFinding`, `EvidenceBundle`, `EvidenceItem` | Evidence cites immutable source hashes and policy versions | Deterministic matching and database-enforced immutability pass |
| Approval/action | Authorized human decision plus action policy | `BusinessAction`, `ActionApproval`, `ActionResult` | Parameters inherit source sensitivity; idempotency and approval are persisted | Internal AP ledger transition passes; an external ERP write is not claimed |
| Exceptions/recovery | Deterministic mismatch or terminal worker failure | `OperationalException`, `ExceptionRecovery` | Exception snapshots source lineage/classification without exposing payload | Retry, replay, edit-and-replay, recovery history, and tenant denial pass |
| Value | Approved baseline/assumptions plus successful action evidence | `ValueDefinition`, `ValueDefinitionVersion`, `ValueEvent`, `BenefitApproval` | Event inherits the higher source/definition classification; formula is immutable | Candidate calculation, allocated cost, source evidence, independent approval/rejection, and immutability pass |
| Retention/legal hold | Environment retention policy and tenant-admin hold | `DataRetentionHold`, `DataRetentionExecution`, `SourceEvent.payloadPurgedAt` | Expired encrypted bytes are erased; immutable payload hash/metadata remain; open exceptions and active holds block erasure | Hold, release, erasure, execution evidence, audit, and non-disclosure pass |
| Object storage | Verified tenant upload or S3-compatible source | S3/MinIO object plus source-event metadata | Tenant prefix, content type, byte size, metadata, and SHA-256 are verified | Presign, completion, temporary deletion, idempotency, and isolation pass |
| AI generation | Configured OpenAI provider request | Provider response returned through the shared adapter | No canned answer or fabricated token stream; missing configuration/provider failure fails closed | Real provider adapter exists; a complete governed knowledge/RAG plane is still outside Release 1 |

Classification protects information. It does not replace consequence controls. Future industry outcome packs must also carry a safety tier that restricts autonomous action independently of data sensitivity.

## Corrections to the supplied gap analysis

The attachment correctly identified broad risks but described several stale model names and runtime assumptions. Source verification established that:

- workflow step/checkpoint/outbox durability belongs to the SQLAlchemy execution database, not invented Prisma `WorkflowNodeRun` or `WorkflowDlq` models;
- current spend models are `Budget`, `BudgetCategory`, `ExpenseClaim`, and `VendorSubscription`;
- AP policy uses immutable `RuleVersion`; general rule JSON is not equivalent to a certified AP rule engine;
- OCR persistence uses `ManagedDocument` and `OcrExtractionJob`, while a production OCR evidence pipeline remains quarantined;
- Redis is transport/coordination, never the analytical source of truth;
- moving sample values into a database seed does not make them real, so the synthetic seed command and seed implementation were removed;
- the old Vite canvas was local/demo behavior, while the active Next.js canvas persists drafts and immutable published versions;
- previously described connector gaps are closed for bounded webhook, PostgreSQL, and file interfaces and have executable live certification.

## Remediation completed in this implementation sequence

- Retired the executable Vite showcase boundary.
- Deleted stale shadow JavaScript and unmounted legacy API/workflow source.
- Removed the synthetic database seed and its commands.
- Replaced insecure random generation, OAuth plain challenge behavior, local authentication/demo fallback, configuration defaults, and Redis localhost fallback with fail-closed behavior.
- Replaced fake S3 and AI success adapters with real SDK/provider implementations.
- Added explicit quarantine, workspace exclusion, import/dependency rejection, and retired-app verification.
- Added runtime scans for mock/fake/dummy/canned content, fabricated provider IDs, forced simulation, public dummy sources, hardcoded tenant defaults, insecure randomness, and local endpoint fallbacks.
- Added package-manifest dependency auditing and mounted controller/provider boundary auditing.
- Implemented and migrated retention/legal hold with one-way payload erasure and immutable evidence.
- Classified permanent outbox errors separately from transient errors so invalid business events are quarantined promptly while transient failures retain durable backoff.
- Corrected Turbo inputs/outputs so Next.js routes and `.next` artifacts participate in the production build cache contract.
- Added authenticated Prometheus control-plane request/process/durable-state metrics with bounded labels,
  explicit database-collector failure, live PostgreSQL certification, and an operator runbook.
- Added authenticated execution-plane run/step/outbox aggregates, explicit collector health, privacy tests,
  and an operator runbook; no tenant, workflow, run, or event identifier is used as a metric label.
- Bounded correlation IDs on both HTTP planes, replaced unsafe caller values, correlated early execution
  authorization failures, and removed raw URLs and exception messages from global error telemetry.
- Expanded the all-runtime scan to the complete active application/package source and configuration surface,
  including JavaScript tooling, Python, JSON, SQL and Prisma files.
- Removed the database default for payment-provider identity and applied the migration; providers must now be
  supplied by the selected real adapter or explicit business operation.
- Removed four dead sidebar destinations and added a machine navigation-boundary audit.
- Quarantined the no-op delivery CLI and disconnected report/PDF chain. The latter embedded a real-company
  profile, bank text, a fabricated digest fallback and an unsupported PKI certification claim.

## Major impact on the current system

| Area | Impact |
| --- | --- |
| Runtime scope | The product boundary is intentionally smaller: uncertified code is unavailable instead of looking complete. |
| User experience | Active screens show persisted records or explicit empty/error states; there is no success-looking fixture fallback. |
| Security | Startup and calls fail closed on missing URLs, secrets, keys, allowlists, or credential references; browser auth uses HTTP-only cookies. |
| Database | Control schema now includes environments, connections, contracts, encrypted events, AP/evidence/action, exception/value, and retention/legal-hold records. Migrations are additive. |
| Integrations | Read paths are independently tested; webhook signatures, DB read-only transactions, and object checksums are enforced. External writes remain separately gated. |
| Operations | More services must be operated: control API/database, execution API/database/workers, Redis transport, and S3-compatible storage. |
| Observability | Operators can scrape real control-plane traffic/process/durable state and execution run/step/outbox aggregates without tenant/entity labels; distributed traces, approved alerts/SLOs, worker RED metrics and representative load proof remain open. |
| Failure semantics | Known permanent validation/business failures stop retrying and become recoverable exceptions; transient failures use durable backoff. |
| Compliance | Payload erasure is now provable without erasing immutable hashes/audit; legal holds and open exceptions prevent premature deletion. |
| Delivery | CI/release must run build, tests, runtime data audits, dependency, API, navigation, and SDLC governance audits. |

## What is still not a production claim

The following are outside the completed Release 1 reference slice and remain future work, not hidden implementation:

- all 109 quarantined package/application roots;
- high-volume streaming telemetry, device identity, time-series storage/downsampling, clock/calibration, and late-event policy;
- authorized document ingestion, malware scanning, OCR extraction, chunk/embedding lineage, citation verification, and RAG evaluation;
- real ERP/CMMS/ticket/payment write adapters with dry run, dual control, reconciliation, and compensation;
- node-scoped resume/retry, true parallel scheduling, wait states, and compensation in the generic workflow engine;
- enterprise SSO/MFA, external secrets-vault lifecycle, break-glass access, and export-purpose controls;
- complete metering, quota, billing, regional residency, backup/restore, disaster recovery, load/soak, penetration testing, and production monitoring evidence;
- the 280-entry industry directory as shipped outcome packs. It remains governed product research until individual packs have authorized real sources and certification.

## Executable evidence

The 2026-09-03 integrated run produced these results:

- monorepo production build: 78/78 tasks passed across 80 active manifests;
- unit/security tests: 10 TypeScript files / 37 tests plus 4 Python tests passed;
- production and all-active-runtime data-integrity audits: passed with 109 quarantine roots enforced;
- package dependency audit: 80 active manifests passed;
- navigation audit: 19 page routes and 33 static internal links passed;
- API module boundary: 8 controllers and 27 providers passed;
- control-plane observability: 11 checks passed;
- execution-plane observability: 9 checks passed;
- control plane: 12 checks passed;
- operational ingestion: 10 checks passed;
- connector interfaces: 15 checks passed;
- AP outcome: 20 checks passed;
- workflow execution: 11 checks passed;
- BFF: 8 checks passed;
- retention/legal hold: 7 checks passed.

These scripts provision isolated records with generated credentials against real local PostgreSQL, Redis, MinIO/S3-compatible storage, HTTP services, and workers. Their records are certification evidence; they are not application fallback data.

## Mandatory release gates

```text
pnpm build
pnpm test
pnpm audit:production-data
pnpm audit:all-runtime-data
pnpm audit:package-dependencies
pnpm audit:api-boundary
pnpm audit:navigation
pnpm audit:sdlc
```

An external production launch additionally requires environment-specific migration rehearsal, backup/restore and disaster-recovery proof, load/soak results, security review, observability/SLO acceptance, and change approval.
