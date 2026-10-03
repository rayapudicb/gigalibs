# WI-OI-110: Metadata and Application Dictionary Foundation

- **Item ID:** `WI-OI-110`
- **Standard Link:** FR-01, FR-02, FR-04, FR-05, FR-08, FR-11, FR-12, FR-13, FR-14, FR-15, FR-17, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-001–003, NFR-UX-001–004, NFR-OBS-001–004, ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019
- **Status:** In Review (implementation complete, all audits and certifications pass)
- **Author:** Antigravity Pairing Assistant
- **Date:** 2026-10-03

---

## 1. Executive Summary

Enterprise Architecture Phase 2 builds a production-grade, metadata-driven Application Dictionary for GigaLibs by extending the existing WI-OI-039 Configuration Studio and ADR-0002 architecture without creating a secondary metadata engine.

The foundation allows platform and tenant administrators to govern entities, fields, relationships, validation rules, UI views, navigation contributions, actions, and device presentation metadata into immutable, checksummed runtime manifests.

---

## 2. Slice Plan & Status

| Slice | Description | Status | Evidence |
|---|---|---|---|
| **AD-0** | Reconciliation matrix & Zod contracts (`@gigalibs/contracts`) | **Complete** | ADR-0019 created, `dictionary.ts`, 8 vitest unit tests passing |
| **AD-1** | Dictionary package compiler (`@gigalibs/configuration-core`) | **Complete** | `dictionary-compiler.ts`, 7 vitest unit tests passing |
| **AD-2** | Persistence & schema extensions (`ConfigurationChangeSet`) | **Complete** | `DictionaryChangeSetDefinitionSchema` union in contracts; existing PostgreSQL models reused |
| **AD-3** | Server APIs & maker-checker authorization (`playground-api`) | **Complete** | `configuration-studio.service.ts`, `controller.ts`, 2 vitest unit tests passing |
| **AD-4** | Module contribution & adapter (`Tenant Profile` adopter) | **Complete** | `TenantProfileConfigurationAdapterV1` extended with locked core fields & dictionary contribution |
| **AD-5** | Application Dictionary administration UI (`workflow-platform`) | **Complete** | `ApplicationDictionaryWorkbench.tsx` integrated in `UniversalDynamicFormsStudio.tsx` |
| **AD-6** | Runtime web/mobile manifest & safe AST renderer | **Complete** | `DictionaryRenderer.tsx` and `dictionary-evaluator.ts`, 3 vitest unit tests passing |
| **AD-7** | Packaging, tenant overlays & lifecycle promotion | **Complete** | Deterministic SHA-256 overlays, cache invalidation, maker-checker promotion |
| **AD-8** | Full production-readiness certification & audit suite | **Complete** | `scripts/verify-application-dictionary.mjs` PASSED; all SDLC audits PASSED |

---

## 3. Slice AD-0 Delivery Evidence

- **ADR-0019:** Published `docs/architecture/ADR-0019-application-dictionary-compiler-and-runtime-manifests.md` with 15 non-negotiable architectural tenets and full iDempiere reconciliation matrix.
- **Contracts:** Created `packages/contracts/src/configuration/dictionary.ts` containing strict versioned schemas for Entities, Fields, Data Classifications, Relationships, References, Bounded Safe AST Validations, Surface Views, Tabs, Sections, Navigation Items, Registered Actions, Messages, and Compiled Runtime Manifests.
- **Unit Tests:** `packages/contracts/src/configuration/dictionary.test.ts` (8/8 passing tests verifying schema bounds, pattern enforcement, safe AST rejection of arbitrary SQL/eval, and manifest structure).

---

## 4. Slice AD-1 Delivery Evidence

- **Compiler Engine:** Implemented `packages/configuration-core/src/dictionary-compiler.ts` providing `compileDictionaryPackage` and `classifyDictionaryImpact`.
  - Canonical deterministic ordering of entities, fields, relationships, references, views, navigation, actions, and messages.
  - Stable SHA-256 checksum calculation over canonical JSON representation.
  - Rejection of duplicate keys across entities, fields, references, validation rules, views, and actions.
  - Rejection of missing entity/reference dependencies.
  - System-locked baseline field property mutation detection and rejection.
  - Navigation hierarchy cycle detection.
  - Rejection of unregistered action handlers and reference resolvers.
  - Semantic impact classification (`COMPATIBLE`, `CONDITIONAL`, `BREAKING`).
- **Unit Tests:** `packages/configuration-core/src/dictionary-compiler.test.ts` (7/7 passing tests).

---

## 5. Slice AD-2 Delivery Evidence

- **Schema Reusability:** Reused existing PostgreSQL models `ConfigurationChangeSet`, `ConfigurationPublishedVersion`, and `ConfigurationActivation` with JSONB definitions/manifests, audit relations, and outbox relay.
- **Definition Schema Extension:** Added `DictionaryChangeSetDefinitionSchema` (`kind: 'APPLICATION_DICTIONARY'`) to the `ConfigurationChangeSetDefinitionSchema` discriminated union in `@gigalibs/contracts`.
- **Zero Runtime DDL:** Confirmed zero runtime DDL for tenant extensions; all extension metadata is persisted and governed within immutable versioned JSONB manifests.

---

## 6. Slice AD-3 & AD-4 Delivery Evidence

- **Control Plane Integration:** Updated `ConfigurationStudioService` in `apps/playground-api/src/configuration-studio.service.ts`:
  - Dispatches dictionary change sets to `compileDictionaryPackage` with adapter baseline locking.
  - Dispatches dictionary compatibility checks to `classifyDictionaryImpact`.
  - Implements `filterDictionaryManifest` for permission-based navigation, action, and field-level masking.
  - Added `listDescriptors` and `listDictionaryContributions` endpoints.
- **Tenant Profile Adopter:** Updated `TenantProfileConfigurationAdapterV1` in `apps/playground-api/src/tenant-profile-configuration.adapter.ts`:
  - Contributes `platform.tenant-profile` entity.
  - Locks core fields (`name`, `slug`, `status`, `region`).
  - Declares `ref-tenant-statuses` reference list and `rule-name-required` validation rule.
  - Declares `platform.tenant-profile.verify-domain` action handler.
- **Unit Tests:** `apps/playground-api/src/configuration-studio.dictionary.spec.ts` (2/2 passing tests).

---

## 7. Slice AD-5 & AD-6 Delivery Evidence

- **Web Administration UI:** Created `apps/workflow-platform/components/configuration/ApplicationDictionaryWorkbench.tsx`:
  - Entities list and detail viewer with primary key and versioning telemetry.
  - Field catalogue with system-locked core vs tenant extension badges and classification badges (`INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`, `PUBLIC`).
  - Relationship and reference explorer for discrete value lists.
  - View, tab, and section layout inspector.
  - Navigation hierarchy viewer with RBAC permission matrix.
  - Registered actions browser validating handler keys against module descriptors.
  - Safe validation rules visualizer.
  - Maker-checker change-set review preventing author self-approval.
  - Mounted as a first-class tab in `UniversalDynamicFormsStudio.tsx`.
- **Presentation & Client Runtime:**
  - Created `packages/configuration-core/src/dictionary-evaluator.ts` implementing `evaluateDictionaryCondition` and `validateDictionaryRules`.
  - Created `packages/configuration-react/src/DictionaryRenderer.tsx` consuming compiled dictionary manifests.
  - Unit tests in `packages/configuration-core/src/dictionary-evaluator.test.ts` (3/3 passing tests).

---

## 8. Slice AD-7 & AD-8 Delivery Evidence

- **Verification Script:** Created `scripts/verify-application-dictionary.mjs` verifying:
  1. ADR-0019 architectural foundation and 15 tenets.
  2. Contracts schemas in `@gigalibs/contracts`.
  3. Compiler determinism, locked property protection, navigation cycle rejection, AST depth bounding, unregistered action rejection, and impact classification in `@gigalibs/configuration-core`.
  4. Client runtime and Safe AST evaluation in `@gigalibs/configuration-react`.
  5. Control plane adapter integration in `apps/playground-api`.
- **Result:** `APPLICATION DICTIONARY FOUNDATION CERTIFICATION: PASS`.
- **SDLC Audits:** All repository audits passed (`audit:production-data`, `audit:all-runtime-data`, `audit:package-dependencies`, `audit:api-boundary`, `audit:navigation`, `audit:sdlc`, `audit:layers`, `module manifests`).
