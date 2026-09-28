# WI-OI-081 — Single module manifest (v1) and generated module catalogue (Wave 0, C2 and C8)

Status: In Progress (sole active item from 2026-09-28)  
Owner: SDLC Orchestrator / Developer Platform / API Contracts  
Plan: `docs/plans/manufacturing-package-solution-plan.md` §4 C2 and C8; ADR-0013 §3  
Independent reviewers: Release Operations, QA/SDET, Product

## G0 — problem

Three unconnected module descriptions exist:
- `modules/*/module.yaml` (v1alpha1, 12 of 20 modules; read by nothing);
- `packages/module-registry` (4 kernel entries in the control plane);
- the hand-written `platformModuleCatalog` in `packages/contracts/src/modules/index.ts` (32 entries). This is
  the only one that drives behaviour: navigation, module access, entitlement eligibility and trials.

A developer adding a module must edit the core contracts package. A per-client solution cannot say which
modules it contains.

## G1 — acceptance

1. **Manifests are the source.** `module.yaml` with `apiVersion: modules.gigalibs.io/v1` is the single module
   manifest. Each module declares its own catalogue entries under `spec.catalog`. Core-served surfaces are
   declared in `platform/core.yaml` (`kind: Core`).
2. **The catalogue is generated.** `packages/contracts/src/modules/catalog.generated.ts` is generated from the
   manifests (`pnpm modules:catalog`), and `platformModuleCatalog` is exported from it. Behaviour must not
   change: the generated catalogue is proven deep-equal, entry by entry and in order, to the hand-written
   catalogue it replaces.
3. **`pnpm audit:module-manifests` fails when:**
   - a v1 manifest is invalid;
   - a catalogue key, route or navigation order is duplicated;
   - a module's `spec.ui.basePath` matches none of its entries;
   - a required or optional module does not exist;
   - the generated file is out of date;
   - a solution file is invalid.
4. **Solution files.** `solutions/<name>.yaml` (`apiVersion: solutions.gigalibs.io/v1`) lists the modules and
   packs of a per-client build. The audit checks that:
   - every module exists with a v1 manifest;
   - required modules are included;
   - the industry pack exists.

   `solutions/manufacturing.yaml` is the first.
5. **Honest metadata.** Modules without a registered work item say so (`workItem: null`, lifecycle
   `prototype`).

## G2 — design

- **Manifest v1:** v1alpha1 plus the following.
  - `metadata.name` must equal the folder name.
  - `spec.catalog[]`:
    - `key`, `name`, `navigationLabel`, `area`, `navigationGroup`, `route`, `iconKey`;
    - `readiness`: AVAILABLE, REVIEW, CONTAINED or PLANNED;
    - `entitlementEligible`, `trialEligible`, `requiredPermission` (or null), `platformInspection`, `reason`;
    - `navigationOrder`, a unique integer that fixes sidebar order;
    - optional `hostedFor` on core entries that serve a business capability still hosted by the control plane
      (for example AP matching → procurement, WI-OI-092).
  - Other `spec` keys stay module-specific and are not interpreted yet.
- **Ownership of today's 32 entries:**
  - `platform/core.yaml`: 12 control-plane surfaces.
  - Module manifests: 20 entries, by `ui.basePath` and upstream. For example `/marketplace` → Platform RBAC,
    `/data-contracts` → Data Studio, `/connections` → Connector Hub.
- **New v1 manifests** for analytics-studio, gigaops, geospatial, esignature, document-scanner, ontology,
  saga-orchestrator and communications. The untracked `communications-textfly` folder is not the owner; its
  v1alpha1 manifest is reported, not read.
- **Tooling:** one script, `scripts/module-manifests.mjs`, using `js-yaml` (already a root dependency). It
  validates, generates, and checks for drift. No runtime code reads YAML: the web and control plane keep
  importing the typed catalogue from `@gigalibs/contracts`.
- **Out of scope:**
  - generating kernel registry entries (the 4 control-plane entries describe kernel components, not modules);
  - selective builds from solution files (WI-OI-083 onwards).

## G3 — test plan

- **Equivalence:** a one-time deep-equal of the generated catalogue against the built hand-written catalogue
  (`packages/contracts/dist`) before the source switch, then contracts build and type check.
- **Tests:** the catalogue consumers' tests (web module access, persona routing, executive control tower, maps
  boundary, tenancy-nest catalogue spec).
- **Negative checks:** the audit rejects a duplicate key, an unknown required module, a stale generated file
  and a solution naming a missing module.

## G4 — implementation (2026-09-28)

**Manifests:**
- 11 tracked v1alpha1 manifests migrated to v1 with `spec.catalog`.
- 8 new v1 manifests: analytics-studio, gigaops, geospatial, esignature, document-scanner, ontology,
  saga-orchestrator and communications. The four without a registered work item say `workItem: null`,
  lifecycle `prototype`.
- `platform/core.yaml` holds the 12 core surfaces. AP matching is marked `hostedFor: procurement`.
- The entries were copied field for field from the built hand-written catalogue by a one-time migration
  script, so no value was retyped.

**Tooling:**
- `scripts/module-manifests.mjs` is both the generator and the audit.
- `pnpm modules:catalog` regenerates the catalogue; `pnpm audit:module-manifests` checks it.
- Enumerations (readiness, navigation groups) are read from the typed contract.

**Generated contract:**
- `packages/contracts/src/modules/catalog.generated.ts` holds 32 entries, each commented with its owning
  manifest.
- `platformModuleCatalog` is exported from it. The hand-written array and its helper were removed.
- `index.ts` went from 561 lines to 52.

**Solution:** `solutions/manufacturing.yaml` lists CMMS, Workforce, Geospatial, Analytics and Connector Hub,
with the manufacturing industry pack. The country pack is null (owner decision D4).

**Reported, not failed:**
- The untracked `modules/communications-textfly/module.yaml` is still v1alpha1.
- AR's optional modules `ledger` and `subscription-metering` have no manifests.

## G5 — evidence (2026-09-28)

- **No behaviour change:**
  - The generated catalogue deep-equals the hand-written one: 32/32 entries, same order, same trial keys.
  - It was checked twice: before the switch, against the built hand-written catalogue, and after the rebuild,
    against the `HEAD` source (commit 808b8d2).
- **Build and tests:**
  - The contracts package builds.
  - Full suite: 217 files and 1,897 tests pass, unchanged from before.
  - `@gigalibs/app-playground-api`: 18 files and 93 tests pass.
- **Negative checks** (on a scratch copy): the audit rejects a duplicate catalogue key, an unknown required
  module (also flagged in the solution), a stale generated catalogue, and a solution naming a missing module.
- **Audits pass:** module-manifests, layers, sdlc, package-dependencies, navigation, anti-duplication,
  api-boundary, production-data.
- **Chains:** `audit:module-manifests` is added to the certification chains.

## Remaining

- Independent review (Release Operations, QA/SDET, Product).
- The web image is not rebuilt: the catalogue is byte-for-byte equivalent in behaviour. The next image build
  picks it up.
- Selective per-solution builds and manifest-driven navigation follow in WI-OI-083.
