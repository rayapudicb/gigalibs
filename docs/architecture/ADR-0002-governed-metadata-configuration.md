# ADR-0002: Governed metadata configuration and extension boundary

- Status: Implemented for bounded local UAT; independent acceptance pending
- Date: 2026-09-09
- Owners: GigaLibs solution architecture and platform engineering
- Work item: WI-OI-039
- Reviewers required before acceptance: Security & Privacy, Backend & Data, Web & Accessibility,
  Finance/Domain, QA/SDET and Product

## Context

GigaLibs currently contains several form engines, module-owned schemas and prototype builders. They do not
form one production runtime. Administrators cannot safely add a field to a supported module entity, publish
it for a tenant, persist values in the owning module, and retain an immutable versioned snapshot through the
record lifecycle.

Treating every field as a source-code change is too slow. Treating identity, authorization, money,
accounting, workflow execution or provider actions as arbitrary tenant-authored configuration would create
unacceptable security, integrity and recovery risks.

Public documentation from major SaaS platforms shows a consistent boundary:

- Dataverse models tables, columns and relationships as metadata, recommends reuse of standard tables and
  transports components through versioned solutions.
- ServiceNow uses a system dictionary to drive table fields, forms and lists, while warning that dictionary
  changes can have broad and difficult-to-reverse effects.
- Salesforce separates deployable customization metadata from business records.
- Shopify uses metafields to extend an existing resource and metaobjects to define a new content entity.
- SAP separates safe key-user changes from developer and side-by-side extensions to protect the clean core.
- Jira custom fields have declared types and lifecycle restrictions; changing an in-use field type is not a
  harmless presentation edit.

These sources describe platform mechanisms rather than the companies' private delivery chronology. The
GigaLibs sequence in the linked plan is an architectural inference from those mechanisms and this
repository's dependencies.

## Decision

GigaLibs will use a **configuration-first, guarded-extension architecture**. “Zero-code” means an authorized
administrator can perform an approved class of change without a product source release. It does not mean
all business behavior can be safely invented through a visual editor.

The platform has five layers:

1. **Coded system of record.** Canonical domain tables, transactions, state machines and invariants remain
   owned by their modules.
2. **Metadata definition plane.** Registered entities, field definitions, component definitions, layouts,
   policies and dependencies are versioned, classified and tenant-scoped.
3. **Compiled runtime plane.** Published metadata is validated and compiled into immutable manifests pinned
   by version and checksum. Runtime clients consume manifests and never execute draft metadata.
4. **Governed automation plane.** Rules and workflows compose registered facts and allowlisted actions. They
   cannot execute arbitrary SQL, JavaScript, shell commands or unrestricted HTTP requests.
5. **Pro-code extension plane.** New invariants, provider adapters, action handlers and complex or isolated
   capabilities use reviewed APIs/events and remain upgrade-safe.

Stable business entities use typed relational columns. Approved custom values use a bounded JSONB extension
document on the owning entity or an associated extension-value table, with `schema_version`, `checksum`,
classification and audit lineage. GigaLibs will not create a physical table or column for each tenant field.
If a custom attribute becomes a common invariant or a high-volume indexed field, the module owner promotes
it through a normal migration and compatibility process.

Metadata definitions are namespaced and owned as one of:

- **platform-owned and locked** for identity, tenancy, audit and shared infrastructure;
- **module-owned and extendable** for approved domain entities; or
- **tenant-owned** for permitted overlays and tenant-defined non-core entities.

Platform permissions and record permissions are evaluated independently. Hiding a field in a layout never
grants or removes server-side access. Secret values are references and are never stored in form definitions,
workflow graphs or environment packages.

Every configuration change follows draft → validate → preview/diff → independent approval where required →
publish immutable version → activate for an environment/cohort → observe → roll forward or pin the last-good
version. Published versions referenced by business records cannot be edited or deleted.

## Safe configuration boundary

Administrators may configure approved labels, help text, optional extension fields, sections, lists, views,
field visibility, requiredness within allowed domain bounds, classifications, bounded validation, mappings,
notification templates, approval routing and workflows made from registered nodes.

Reviewed product code remains required for authentication, session policy, tenant isolation, RBAC semantics,
money arithmetic, tax/accounting rules, ledger behavior, financial state transitions, idempotency,
reconciliation, credential handling, cryptography, retention enforcement, migrations, provider adapters and
new external action handlers.

## Consequences

- The existing form packages are source inventory. They cannot be promoted independently as the production
  platform and production imports remain prohibited until reconciled under WI-OI-039.
- Each adopting module supplies an adapter that declares supported entities, commands, permissions,
  extension storage, immutable snapshot points, indexing limits and business invariants.
- The first proof is a low-risk tenant-profile entity. The first financial adopter is AR invoice draft;
  issued invoices retain an immutable custom-field snapshot.
- AR calculation inputs such as quantity, unit price, currency, tax basis, account treatment and totals do
  not become arbitrary custom attributes.
- One vertical adopter is completed and certified before a second module enters Build.
- A generic record store may support explicitly accepted tenant-owned non-core entities. It cannot replace
  the canonical customer, invoice, payment, supplier, asset, work-order, workflow, action or audit owners.

## Compatibility and recovery

Published field keys are immutable. Compatible additions create a new schema version. Rename is a label
change or a migration to a new key; type changes require a new field and an explicit conversion/backfill.
Removal deprecates the field while retained records remain readable. Runtime writes require the expected
schema checksum and return a conflict for stale clients.

Configuration packages declare dependencies and environment parameters. Promotion carries definitions,
not customer data or secret values. Rollback means pinning a prior compatible manifest or applying a tested
forward fix; it never rewrites an issued financial snapshot.

## References

- [Production rollout and module adoption plan](../plans/universal-configuration-studio-production-rollout.md)
- [Portable resolved-manifest schema](../contracts/configuration-studio/configuration-manifest.schema.json)
- [Configuration Studio OpenAPI draft](../contracts/configuration-studio/openapi.yaml)
- [Security, data and migration design](CONFIGURATION_STUDIO_SECURITY_DATA_MIGRATION_DESIGN.md)
- [Acceptance test plan](../plans/configuration-studio-acceptance-test-plan.md)

- [Dataverse tables and metadata](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-edit-metadata)
- [Power Apps solutions and application lifecycle management](https://learn.microsoft.com/en-ie/power-apps/maker/data-platform/solutions-overview)
- [ServiceNow tables and data models](https://www.servicenow.com/docs/r/application-development/tables-and-data-models.html)
- [ServiceNow system dictionary](https://www.servicenow.com/docs/r/platform-administration/table-administration-and-data-management/c_SystemDictionary.html)
- [Salesforce Metadata API](https://developer.salesforce.com/docs/service/salesforce-knowledge-dev-guide/guide/knowledge-development-meta-intro.html)
- [Shopify metafields and metaobjects](https://shopify.dev/docs/apps/build/metaobjects/data-modeling-with-metafields-and-metaobjects)
- [SAP extensibility options](https://help.sap.com/docs/ABAP_PLATFORM_NEW/b5670aaaa2364a29935f40b16499972d/82dc267d4b0b4b309b40c22f700fe5c2.html)
- [Jira custom fields](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-custom-field/)
