# ADR-0019: Application Dictionary compiler, ownership and runtime manifests

- Status: Accepted for Implementation (WI-OI-110)
- Date: 2026-10-03
- Owners: GigaLibs Platform Architecture & SDLC Orchestration
- Work Item: WI-OI-110
- Depends on: ADR-0002 (Governed Metadata Configuration), ADR-0013 (Core Modules), ADR-0016 (Kernel Foundations), ADR-0018 (Organization Scope)

---

## 1. Context

GigaLibs requires a production-grade, metadata-driven Application Dictionary to model entities, module-owned and tenant-extension fields, relationships, validation rules, presentation surfaces (windows, tabs, sections, forms, lists), navigation trees, registered action handlers, messages/translations, and device layouts.

Rather than introducing a fragmented secondary metadata engine, this ADR unifies all metadata capabilities under the existing **WI-OI-039 Configuration Studio** architecture established in ADR-0002.

To inform our design, we conducted a structural analysis of the battle-tested open-source ERP reference implementation in **iDempiere** (`/Users/rayapudi/idem`). iDempiere models its entire operational interface through its Application Dictionary (`AD_Table`, `AD_Column`, `AD_Window`, `AD_Tab`, `AD_Field`, `AD_Reference`, `AD_Val_Rule`, `AD_Menu`, `AD_Process`, `AD_Message`). However, iDempiere relies on legacy paradigms that are unacceptable for modern multi-tenant cloud SaaS: raw SQL WHERE injection for dynamic validation, runtime DDL execution, mutable global context (`Env.getCtx()`), Org 0 system client conflation, numeric database IDs, and tightly coupled Java active-record generation.

This ADR establishes the architectural principles and reconciliation model to adopt iDempiere's proven conceptual strengths while rejecting its legacy security and operational liabilities.

---

## 2. Fifteen Non-Negotiable Tenets

1. **One metadata lifecycle:** The existing Configuration Studio (`ConfigurationChangeSet`, `ConfigurationPublishedVersion`, `ConfigurationActivation`) is the single authority for draft, review, approval, publication, and activation.
2. **One module registry:** `module.yaml` and the generated module catalogue remain the authoritative source for module identity, entitlements, and dependencies.
3. **One adapter registry:** `ModuleAdapterDescriptorV1` remains the unified boundary through which modules expose extendable slots and register capabilities.
4. **One compiler:** `packages/configuration-core` performs canonical normalization, dependency cycle validation, locked-property protection, and deterministic SHA-256 checksum generation.
5. **One renderer family:** `packages/configuration-react` consumes compiled manifests to generate accessible web and mobile user interfaces.
6. **One immutable runtime-manifest contract:** Web, tablet, and mobile clients consume immutable, checksummed manifests keyed by version and hash.
7. **Deterministic layering:** Compilation resolves strictly: Platform Baseline → Module Contribution → Tenant Overlay → Role / Device / Locale presentation variant.
8. **Server-resolved tenancy and organization authority:** Tenant identity and WI-OI-109 organization scope are verified server-side on every request and can never be overridden or expanded by metadata.
9. **Module APIs remain business command authority:** Metadata visibility or layout definitions never bypass module business invariants, RBAC, domain validation, or state machines.
10. **No runtime tenant DDL:** The database schema is never mutated by tenant configuration at runtime. Extension fields are stored in structured, validated extension storage.
11. **No generic PATCH-any-table API:** Every data mutation routes through verified module adapters or strictly governed non-core record stores.
12. **No arbitrary code execution:** Arbitrary SQL, raw JavaScript, dynamic `eval()`, `Function()`, shell commands, or unconstrained outbound HTTP calls are strictly prohibited.
13. **Registered action keys only:** Action buttons in metadata bind strictly to registered, compile-time reviewed code handlers.
14. **Immutability of published keys:** Published keys are permanent. Field removal is modeled as deprecation; changing a field type requires provisioning a new field key.
15. **Separation of metadata and customer data:** Metadata packages contain entity declarations and UI layout parameters only. Customer business records, credentials, and secrets are strictly excluded.

---

## 3. iDempiere Architecture Reconciliation Matrix

| iDempiere Concept | Source Reference | Business Purpose | Decision | GigaLibs Owner | GigaLibs Contract | Security Boundary | Persistence & Runtime Treatment |
|---|---|---|---|---|---|---|---|
| **AD_Table** | `MTable.java` / `X_AD_Table.java` | Defines database table, access level, change log, window binding | **ADAPT** | Module Owner + Configuration Studio | `DictionaryEntityV1` | Module owns entity invariants; RBAC checks server-side | Registered via `module.yaml` and `module-sdk`; compiled into entity manifest; no runtime tenant DDL. |
| **AD_Column** | `MColumn.java` / `X_AD_Column.java` | Column attributes: type, reference, mandatory, encryption, updatable | **ADAPT** | Module Owner (core) / Tenant Admin (slots) | `DictionaryFieldV1` | Strict data classification (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED); masking | Core fields locked by module; custom fields constrained to approved extension slots with `CONFIG_MAX_FIELDS` limit. |
| **AD_Window** | `MWindow.java` / `X_AD_Window.java` | Top-level presentation surface for an entity or business flow | **ADAPT** | Configuration Studio | `DictionarySurfaceV1` | Surface access requires module entitlement and role permission | Pure presentation manifest compiling tabs, actions, and views; device-responsive layout. |
| **AD_Tab** | `MTab.java` / `X_AD_Tab.java` | Relational tab/sub-panel (master-detail hierarchy 0, 1, 2) | **ADAPT** | Configuration Studio | `DictionaryTabV1` | Child tab queries enforced with tenant and parent composite FK | Declarative layout with hierarchy level, parent-child column links, and conditional visibility AST. |
| **AD_Field** | `MField.java` / `X_AD_Field.java` | Visual widget on a tab, display logic, column binding, grouping | **ADAPT** | Configuration Studio | `DictionaryFieldPlacementV1` | Field-level read/write/mask permissions enforced server-side | UI placement metadata (section, order, widget component, read-only rule). |
| **AD_Reference** | `MReference.java` | Reference types: Table Dir (FK), List (enums), Table (query) | **ADAPT** | Module Owner + Platform | `DictionaryReferenceV1` | Query resolvers bound to tenant scope and registered resolvers | List values compiled statically; table references route through registered, bounded resolvers with pagination. |
| **AD_Val_Rule** | `MValRule.java` | Dynamic validation rule (uses raw SQL WHERE clause in iDempiere) | **REJECT raw SQL / ADOPT Safe AST** | Configuration Studio (`condition.ts`) | `DictionaryValidationRuleV1` (Safe AST) | Zero raw SQL or eval. Pure AST with bounded operators (`eq`, `in`, `gt`, `matches`) | Compiled into deterministic JSON AST. Evaluated server-side on write and client-side for UI interactivity. |
| **AD_Menu** | `MMenu.java` | Hierarchical navigation tree organizing windows, processes, forms | **ADAPT** | Platform Navigation Service | `DictionaryNavigationItemV1` | Route visibility filtered by user's effective RBAC and active subscriptions | Declarative menu contribution; cannot expose unentitled or unauthorized routes. |
| **AD_Process** | `MProcess.java` | Registered executable business logic, reports, and batch actions | **ADAPT** | Module Owner + Background Workers | `DictionaryActionV1` | Only compile-time registered action handlers allowed; no arbitrary script execution | Metadata declares button, icon, and parameters; execution dispatches to verified NestJS/Go command handler. |
| **AD_Message** | `MMessage.java` | UI labels, error messages, and multilingual translations | **ADAPT** | Platform I18n Engine | `DictionaryMessageV1` | Tenant-scoped translation overlays; no executable formatting strings | Keyed string bundles compiled per locale into the client manifest. |

---

## 4. Compilation & Runtime Pipeline

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│   Platform Baseline    │  +   │  Module Contributions  │  +   │     Tenant Overlay     │
│   (System Entities)    │      │ (module.yaml / SDK)    │      │  (Configuration Studio)│
└───────────┬────────────┘      └───────────┬────────────┘      └───────────┬────────────┘
            │                               │                               │
            └───────────────────────┬───────┴───────────────────────────────┘
                                    ▼
                     ┌─────────────────────────────┐
                     │  Dictionary Package Compiler │
                     │  (packages/configuration-   │
                     │   core)                     │
                     │                             │
                     │  - Validate schema types    │
                     │  - Enforce locked fields    │
                     │  - Detect dependency cycles │
                     │  - Sort canonical keys      │
                     │  - Calculate SHA-256 hash   │
                     └──────────────┬──────────────┘
                                    ▼
                     ┌─────────────────────────────┐
                     │ Immutable Runtime Manifest  │
                     │ (Version, Checksum, ETag)   │
                     └──────────────┬──────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌─────────────────────────────┐               ┌─────────────────────────────┐
│    Web Client Renderer      │               │   Mobile / Tablet Client    │
│  (@gigalibs/configuration-  │               │   (@gigalibs/mobile)        │
│   react)                    │               └─────────────────────────────┘
└─────────────────────────────┘
```

---

## 5. Consequences & Compliance

- **Zero Runtime DDL:** Prevents PostgreSQL locks, catalog bloat, schema divergence across tenants, and migration complexity.
- **Fail-Closed Security:** Corrupted or stale client checksums are rejected. Unregistered actions or fields trigger validation errors during compilation.
- **Upgrade Safety:** Platform migrations and module releases preserve custom extension slots without breaking tenant customization.
