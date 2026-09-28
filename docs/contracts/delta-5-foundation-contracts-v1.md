# Delta 5 foundation contracts v1 — design baseline

Status: Proposed under WI-OI-044; design only, not a runtime contract
Owner: API Contracts with Solution Architecture and affected domain owners
Runtime target after acceptance: `@gigalibs/contracts`

This document defines exact logical contracts for later bounded Build items. It does not authorize adding
them to production packages. Names use `snake_case` at serialized boundaries. TypeScript adapters may map
to local naming without changing wire meaning.

## 1. Contract rules

- Every schema sets `schema_version: 1` and rejects unknown fields at trust boundaries.
- IDs are non-empty opaque strings; callers cannot infer database topology from them.
- Timestamps are UTC RFC 3339 strings with explicit semantics.
- Payloads are bounded by schema-specific limits accepted at G3.
- No password, bearer token, private key, webhook secret, connection string or recoverable credential value
  is permitted.
- Tenant and actor inputs are revalidated against authoritative state before material effects.
- Data classification is one of `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`.
- Backward-compatible additions are optional until every supported producer supplies them.
- Breaking changes require a new schema version and a producer/consumer migration window.

## 2. Synchronous authority

The existing `PlatformContextV1` remains authoritative and unchanged by this design. Its canonical fields
include `iss`, `aud`, `sub`, `tenant_id`, `session_id`, `auth_version`, roles, granted scopes, persona,
`org_scope`, entitlement, timestamps and `jti`.

Services must verify signature, issuer, audience, expiry, session/auth version, tenant membership,
entitlement and required scope. A client-provided tenant header or body field cannot replace it.

## 3. `AsyncAuthorityRefV1`

Async messages carry a minimum reference rather than copying the signed token:

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `schema_version` | integer | yes | exactly `1` |
| `tenant_id` | string | yes | must match job/event/binding/artifact records |
| `deployment_id` | string | conditional | required when a tenant has more than one deployment |
| `actor_type` | enum | yes | `HUMAN`, `SERVICE`, `WORKFLOW`, `CONNECTOR`, `SYSTEM` |
| `actor_id` | string | yes | immutable subject reference |
| `session_id` | string | conditional | human-origin work; may be expired when executed |
| `auth_version` | non-negative integer | yes | used to detect revocation/change |
| `requested_capability` | string | yes | one allowlisted module capability |
| `entitlement_module_key` | string | yes | rechecked before effect |
| `policy_decision_id` | string | conditional | required for approval/policy-controlled effects |
| `org_scope_fingerprint` | string | conditional | evidence only; current scope is resolved again |
| `requested_at` | timestamp | yes | server-issued |

An authority reference is never sufficient by itself to authorize an effect.

## 4. `OperationContextV1`

Common fields embedded by reference or value in job/event/audit commands:

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `schema_version` | integer | yes | exactly `1` |
| `correlation_id` | string | yes | stable end-to-end journey ID |
| `causation_id` | string | yes | immediate request/job/event ID |
| `idempotency_key` | string | mutation | scoped with tenant/module/operation |
| `traceparent` | string | no | W3C-compatible; never authority |
| `module_key` | string | yes | registered module owner |
| `configuration_version_id` | string | conditional | pins immutable manifest when configuration affected behavior |
| `data_classification` | enum | yes | highest classification of referenced data |
| `authority_ref` | `AsyncAuthorityRefV1` | async | required for material async work |

## 5. `ModuleAdapterDescriptorV1`

| Field | Type | Required rule |
| --- | --- | --- |
| `schema_version` | integer | exactly `1` |
| `adapter_id` | string | globally stable code-owned identifier |
| `module_key` | string | registered entitlement module |
| `entity_type` | string | code-owned, not a table name |
| `adapter_version` | semver | immutable released version |
| `configuration_schema_versions` | integer array | bounded supported set |
| `capabilities` | enum array | subset of `CREATE`, `READ`, `UPDATE`, `DELETE`, `LIST`, `FILTER`, `SORT`, `IMPORT`, `EXPORT` |
| `permission_map` | object | capability to server-side permission/scope |
| `core_fields` | array | locked code-owned descriptors |
| `extension_slots` | array | allowed types/count/classifications/presentation surfaces |
| `filter_contract` | object | allowed fields/operators/depth/predicate count/cost class |
| `storage_strategy` | enum | `OWNER_JSONB`, `OWNER_EXTENSION_TABLE`, `CANONICAL_COLUMNS` |
| `snapshot_points` | string array | immutable lifecycle points, if any |
| `job_types` | string array | accepted durable operations |
| `event_types` | string array | facts the adapter can emit |
| `audit_policy_id` | string | code-owned redaction/classification policy |
| `limits` | object | accepted fields, payload bytes, list values, nesting, page/export size |
| `compatibility` | object | minimum/maximum runtime and deprecation window |

Unknown capability, entity, field, operator, renderer, job or event is denied.

## 6. `FilterAstV1`

```text
node := predicate | and(node[]) | or(node[]) | not(node)
predicate := { field_key, operator, value? }
```

Rules:

- Operators come from the adapter allowlist, for example `EQ`, `NE`, `IN`, `LT`, `LTE`, `GT`, `GTE`,
  `IS_NULL`, `STARTS_WITH`.
- No SQL fragments, functions, subqueries, arbitrary relationship paths, regular expressions or executable
  expressions.
- Depth, node count, `IN` cardinality, string length, date/numeric range and query-cost class are bounded.
- The adapter compiles to parameterized repository queries and applies deterministic cursor pagination.
- Authorization predicates and tenant predicates cannot be supplied or removed by the AST.

## 7. `DurableJobCommandV1`

| Field | Type | Required rule |
| --- | --- | --- |
| `schema_version` | integer | exactly `1` |
| `job_id` | string | references committed authoritative job record |
| `tenant_id` | string | must match job and binding |
| `deployment_id` | string | when applicable |
| `module_key` | string | owning module |
| `job_type` | string | adapter/module allowlist |
| `attempt_hint` | integer | transport observation only; database attempt is authoritative |
| `context` | `OperationContextV1` | required |
| `input_artifact_ids` | string array | bounded references; no raw file bytes |
| `checkpoint_version` | integer | optional resume hint; authoritative checkpoint is reloaded |
| `expires_at` | timestamp | terminal after expiry unless policy permits recovery |

The command intentionally excludes provider credentials, email/webhook secrets, connection strings,
attachments, raw row sets and arbitrary destination URLs.

### 7.1 Authoritative job states

```text
REQUESTED -> ACCEPTED -> QUEUED -> RUNNING -> SUCCEEDED
REQUESTED/ACCEPTED -> REJECTED
QUEUED/RUNNING -> RETRY_SCHEDULED -> QUEUED
QUEUED/RUNNING -> CANCEL_REQUESTED -> CANCELLED
QUEUED/RUNNING/RETRY_SCHEDULED -> FAILED_TERMINAL
QUEUED -> EXPIRED
any nonterminal state -> RECONCILIATION_REQUIRED
```

Every transition records expected version, actor/system reason and timestamp. Progress is bounded and
monotonic per attempt. Transport completion cannot set `SUCCEEDED` without the module effect and durable
transition.

### 7.2 Logical job records

- `job`: identity, tenant/deployment/module/type, idempotency, state/version, requester, pinned
  configuration, progress, expiry and timestamps.
- `job_attempt`: attempt number, worker build/runtime, lease/heartbeat, start/end and classified result.
- `job_checkpoint`: versioned opaque cursor/reference with checksum and compatibility version.
- `job_artifact_link`: input/output/error artifact ID and purpose.
- `job_command_history`: cancellation/retry/replay request and policy outcome.

Physical tables are decided by the owning Build ADR. Services never query another module's job tables.

## 8. `DomainEventEnvelopeV1`

| Field | Type | Required rule |
| --- | --- | --- |
| `schema_version` | integer | exactly `1` |
| `event_id` | string | globally unique and immutable |
| `event_type` | string | past-tense completed fact plus versioned schema |
| `producer_module` | string | authoritative domain owner |
| `tenant_id` | string | required for tenant fact |
| `deployment_id` | string | when applicable |
| `aggregate_type` | string | code-owned type, not table name |
| `aggregate_id` | string | opaque module identifier |
| `aggregate_version` | integer | optimistic/domain version |
| `aggregate_sequence` | integer | required only when per-aggregate ordering is promised |
| `occurred_at` | timestamp | domain occurrence semantics documented by producer |
| `committed_at` | timestamp | owning transaction commit time when available |
| `context` | `OperationContextV1` | correlation/causation/classification |
| `payload` | object | minimum non-secret integration fact |
| `producer_build` | string | immutable artifact/version reference |

Consumers key durable receipts by `(consumer_id, event_id)`. Unknown schema versions are quarantined, not
coerced. Replay never edits the original envelope.

## 9. Outbox and inbox contracts

### Outbox logical fields

`outbox_id`, envelope, status, available time, lease owner/expiry, attempt count, last classified error,
published time, transport reference and created time.

### Inbox logical fields

`consumer_id`, `event_id`, tenant, received time, schema version, processing status, attempt count, effect
reference, completed time and last classified error.

Required states distinguish pending, leased/processing, published/completed, retry scheduled, quarantined
and reconciliation required. Lease recovery is compare-and-swap. Outbox cleanup occurs only after accepted
retention and replay requirements are met.

## 10. `TenantDataBindingV1`

This extends the meaning of the existing `TenantIsolationBinding`; it does not create a second authority.

| Field | Required rule |
| --- | --- |
| `binding_id`, `binding_version` | immutable version reference |
| `tenant_id`, `deployment_id` | exact routing scope |
| `service_or_module` | bounded owner/workload |
| `isolation_profile` | certified shared-schema, schema-per-tenant or dedicated-database profile |
| `database_cluster_ref`, `database_name_ref`, `schema_ref` | opaque approved topology identifiers |
| `credential_ref` | secret-manager reference only |
| `region`, `residency_policy_id` | routing constraint |
| `migration_version`, `compatibility_state` | block incompatible runtime |
| `workload_policy_id` | pool, timeout and admission policy |
| `status` | `PROVISIONING`, `ACTIVE`, `DRAINING`, `SUSPENDED`, `MIGRATING`, `RECOVERY`, `RETIRED` |
| `credential_version`, `rotated_at` | rotation evidence without secret value |
| `backup_policy_id`, `recovery_owner` | certified recovery mapping |

Missing, ambiguous, suspended or incompatible binding fails closed. Cached bindings retain version/TTL and
cannot outlive an invalidation/revalidation policy.

## 11. `ArtifactDescriptorV1`

Required fields: `artifact_id`, tenant/deployment, owning module, purpose, immutable object reference,
classification, content type, byte count, SHA-256 checksum, encryption/key reference, scan status,
created/expiry timestamps, retention policy and creator job/actor reference.

Object keys are server-created and tenant-prefixed. Raw object URLs are not persistent business fields.
Upload/download grants are operation-specific, short-lived and separately audited.

## 12. `AuditEvidenceV1`

| Field | Required rule |
| --- | --- |
| `schema_version`, `audit_id` | versioned unique evidence |
| `tenant_id`, `deployment_id`, `owner_module` | source ownership |
| `chain_scope`, `chain_sequence` | transaction-safe ordered integrity scope |
| `previous_hash`, `record_hash`, `hash_algorithm` | integrity evidence |
| `actor_type`, `actor_id`, delegation/impersonation refs | accountable actor chain |
| `policy_decision_id`, `authority_version` | authorization evidence |
| `action`, `resource_type`, `resource_id`, `resource_version` | material operation |
| `outcome` | `ATTEMPTED`, `DENIED`, `COMMITTED`, `FAILED`, `CANCELLED`, `RECONCILED` |
| `occurred_at`, `committed_at` | unambiguous times |
| correlation, causation, request/job/event IDs | journey reconstruction |
| configuration/source references | when behavior/data depended on them |
| `change_set` | schema-aware bounded patch or encrypted artifact reference |
| classification/redaction policy IDs | explain omission/masking |
| reason/approval references | when policy requires |

Chain verification returns one of:

- `VALID`: every required record is sealed and the chain verifies;
- `INVALID`: a hash, sequence or linkage mismatch exists;
- `INCOMPLETE`: expected records/range are absent;
- `UNSEALED`: records exist without required proof; never reported as valid.

## 13. `FoundationErrorV1`

All boundaries return/log stable codes separate from safe messages:

- `code`, `category`, `retryable`, `safe_message`, `correlation_id`;
- optional `field_errors` containing allowlisted field keys only;
- optional `retry_after_seconds` for bounded transient failure;
- operator detail stored by protected reference, never sent to unauthorized clients.

Categories: `VALIDATION`, `AUTHENTICATION`, `AUTHORIZATION`, `TENANT_BINDING`, `CONFLICT`, `EXPIRED`,
`DEPENDENCY_TRANSIENT`, `DEPENDENCY_TERMINAL`, `CAPACITY`, `INCOMPATIBLE_VERSION`, `INTEGRITY`,
`RECONCILIATION_REQUIRED`, `INTERNAL`.

## 14. Compatibility gate

Before any schema becomes runtime code:

1. assign owning package/module and generated schema artifact;
2. define byte/count/depth limits and stable error codes;
3. add producer and consumer fixtures;
4. prove unknown-field and incompatible-version rejection;
5. prove no credential/sensitive payload paths;
6. document additive and breaking evolution;
7. link migrations, retry/recovery and observability;
8. obtain independent API, Security, Domain and QA review.
