# Configuration Studio acceptance test plan

Status: Proposed G3 test design for WI-OI-039; independent QA acceptance required  
System under test: CS-01 through CS-09 and one module-owned reference adapter

## 1. Certification outcome

Certification proves that an authorized configuration change becomes a checksummed active manifest and a
module-owned persisted value without tenant leakage, permission bypass, fabricated data or unsafe rollback.
Package tests and UI screenshots alone do not satisfy this result.

## 2. Required environments and evidence

- clean and upgraded PostgreSQL 16 databases plus a restored-backup copy;
- at least two isolated tenants, distinct admin/member/viewer roles and one suspended member;
- two application replicas to exercise cache/event convergence;
- attributable synthetic UAT records excluded from value reporting and deleted after retention checks;
- browser, API, database, audit/outbox, metrics/trace and migration evidence tied to correlation IDs;
- no enabled AI or external provider for the base certification.

## 3. Reference journeys

### Journey A: tenant profile extension

1. Tenant A administrator creates optional `operating_region_note` for the registered profile edit surface.
2. The compiler validates the field, classification, permissions, layout and compatibility.
3. A distinct authorized reviewer approves the exact checksum.
4. An activator publishes and activates the immutable version for Tenant A UAT.
5. Tenant A member writes a permitted value through the profile API.
6. The value survives refresh and application/database restart and appears in authorized export.
7. Tenant A viewer receives masked or denied behavior according to policy.
8. Tenant B cannot discover the definition, manifest, value, search projection, audit or cache entry.
9. Rollback selects the last-good manifest; historical value remains retained and governed.
10. Erasure/export behavior follows the owning profile record policy.

### Journey B: AR invoice extension

1. Register `customer_po_reference` as an optional non-financial field on customer and invoice-draft surfaces.
2. Persist it through the owning AR API and PostgreSQL transaction.
3. Issue an invoice and pin the field value, schema version, manifest checksum and template version.
4. Change/deprecate the active field configuration.
5. Prove the issued invoice still renders and exports from its immutable snapshot.
6. Prove the field cannot change quantity, unit price, currency, tax basis, totals, ledger state or invoice transitions.

## 4. Test matrix

| Area | Required scenarios | Pass condition |
| --- | --- | --- |
| Registry | Unknown, duplicate, reserved and unauthorized keys; incompatible component/type | Invalid entries rejected before storage/publication |
| Change sets | Create, edit, abandon, stale `If-Match`, concurrent authors | One deterministic winner; no overwritten draft |
| Compilation | Same input, unknown properties, invalid reference, cycle, depth/size abuse | Stable checksum; unsafe documents fail closed |
| Expressions | Every operator/type pair, missing value, hostile content, deep AST | Client/server parity within resource limits; no code/network execution |
| Compatibility | Optional add, rename label, required add, tighten rule, type/key change, used-option removal | Correct class and migration/activation gate |
| Review | Self-approval denial where required, checksum changed after approval, unauthorized reviewer | Approval binds exact checksum and separation policy |
| Publication | Retry/replay, concurrent publish, transaction failure | One immutable version and one auditable outcome |
| Activation | Preview/UAT/canary/all, missing dependency, event loss, replica restart, failure and rollback | All replicas converge or fail closed; last-good restored |
| Rendering | Create/edit/read/list; loading/empty/denied/stale/error/success; unknown component | Accessible complete states; unsupported component fails closed |
| Field security | Read/write/read-only/write-only/masked/export permissions | Server response and mutation enforce effective field policy |
| Module adapter | Unknown field, stale checksum, invariant violation, partial transaction failure | No partial record/value/audit/outbox write |
| Persistence | Refresh, app restart, DB restart, backup/restore | Version, activation and values remain consistent |
| Tenancy | API, DB, cache, search, export, audit and package negative cases | Zero cross-tenant disclosure or mutation |
| Projection | Approved index, backfill checkpoint, rebuild, failure, permission filtering | Activation waits where required; query preserves policy |
| ALM | Export/import signature, dependency, environment binding, drift, secret/business-data scan | Definitions only; tampering and unsafe drift rejected |
| Observability | Correlation, metrics, trace, alert and runbook | Operator can identify actor/tenant/version/outcome without sensitive payload |
| Performance | Cold/warm manifest, 250 fields, concurrent reads/edits, projection load | Meets independently agreed budgets without bypassing validation/security |
| Accessibility | Keyboard, focus, labels/errors, screen reader, zoom, locale, reduced motion | WCAG 2.2 AA automation plus recorded manual review |
| Recovery | Bad activation, cache poison, lost event, restore, forward fix | Tested recovery preserves immutable snapshots and audit lineage |
| AI, optional | Provider disabled/down, hostile prompt, sensitive input, malformed output, publish request | Manual Studio works; proposal is bounded; publish/activation impossible |

## 5. Required negative security cases

- forged tenant, role, field permission, published-version and checksum values;
- active token after user/member/tenant suspension or role downgrade;
- mass-assignment of canonical, immutable and hidden fields;
- HTML/script payloads in label, help, option and extension values;
- expression bombs, cyclic references, oversized payloads and unregistered pattern keys;
- IDOR across change set, version, activation, manifest, value, audit and package identifiers;
- cache-key omission for tenant, role/field policy, locale or checksum;
- package with secret reference value, business records, altered signature or undeclared dependency;
- replayed publication/activation/module-write commands with same and different request checksums.

## 6. Mandatory certification commands

The implementation work item must add focused contract, compiler, API, migration, renderer, adapter and
browser commands. Before G5 handoff it must also pass:

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

## 7. Release stop conditions

- WI-OI-013 authority or tenant lifecycle remains unaccepted for the target environment.
- Any tenant/RBAC/object/field negative case fails.
- Draft metadata reaches runtime or a renderer becomes a write authority.
- Runtime code, SQL, arbitrary URL or secret value is accepted by configuration metadata.
- PostgreSQL 16 clean/upgrade/restore, rollback/forward-fix or multi-replica evidence is missing.
- An issued financial snapshot changes after current configuration changes.
- A production-reachable fixture, fabricated success or silent persistence fallback exists.
- Independent Architecture, Security, Backend/Data, Web/Accessibility, QA, affected Domain or Product decision is missing.
