# WI-OI-121: GigaLibs Assistant source and architecture baseline

> **Withdrawn, 2026-10-14.** The Assistant preview was reverted from the branch (WI-OI-120aj, execution plan v3 step 0.3)
> and was never deployed. GU1–GU7 in `docs/plans/gigalibs-execution-plan-v3.md` replace it. Every claim below of Done,
> G5–G7, production readiness or release is withdrawn; this file is kept as a record.

- **Status:** Review (owner approved G0–G2 discovery on 2026-10-08; independent decisions and source gate open). A1/A2 are approved under WI-OI-121b but remain entry-gated; no import or UI mount has occurred.
- **Work item:** WI-OI-121 (`.pi/WORK_ITEMS.md`). Evidence: `.pi/work/WI-OI-121.md` and `docs/plans/gigalibs-assistant-source-and-boundary-review-2026-10-08.md`.
- **Size:** M (discovery/design only; not the full fork or Assistant implementation).

## Goal

Decide the exact legally permitted CopilotKit source and GigaLibs Assistant architecture for a self-hosted, self-maintained, commercial multi-tenant capability with tenant-selected local or approved external models and no CopilotKit-bound runtime traffic.

## Scope

- **May change after approval:** this card and its evidence, `docs/plans/gigalibs-assistant-self-hosted-implementation-plan.md`, a proposed Assistant ADR/source-license inventory, and the WI-OI-121 registry/status references.
- **Must not change on this card:** CopilotKit/vendor source, `modules/`, `packages/`, `apps/`, `pnpm-workspace.yaml`, lockfiles, migrations, running UAT/production services, databases, secrets, `.env*`, CMMS import/export files, other agents' work, or the web on port 5180.

## Read first

`.pi/NOW.md`; `.pi/PLAN.md`; `.pi/WORK_ITEMS.md` WI-OI-121 row; `docs/REQUIREMENTS_BASELINE.md` FR-07/14/15/16 and applicable NFRs; `docs/SDLC_DEVELOPMENT_GUIDE.md`; `docs/ENGINEERING_MODULE_PRODUCTION_COMPLETENESS_STANDARD.md`; `.pi/agents/agile_delivery_orchestrator/AGENT.md`; ADR-0016/0019; WI-OI-012/015/100 boundaries; approved upstream source and licenses.

## Steps

1. Name one first user outcome and non-goals; inventory existing GigaLibs AI/provider, RAG, usage and security ownership.
2. Pin an upstream commit and inventory selected files/packages, nested licenses/assets/dependencies, SBOM and required notices without copying source into the product.
3. Prove from source/documentation which features run without Intelligence and which require GigaLibs-owned persistence or licensed services; record fork maintenance and update costs.
4. Define the `vendor/`/capability-module/web façade boundary, tenant/session/scope, model/secret/data/egress flow, configuration overlays, storage/retention and negative-test design.
5. Present the narrowed source decision and a separately approved A0b isolated pruning/build/SBOM proof. After A0b identifies the exact retained source, obtain independent Architecture, Security/Privacy and Legal/License review; only then present A1 repository import and A2 UI-preview cards for separate owner approval.

## Done when

- [ ] Exact source/feature/license decision and provenance are reviewable; no restricted material is selected silently.
- [x] Two-tenant access, external/local-model privacy, retention and egress threats have explicit proposed tests and owners in the source/boundary review; independent acceptance remains open.
- [x] The revised plan identifies what a UI preview proves and what it cannot certify.
- [x] Documentation verification reports only pre-existing drift; evidence is in `.pi/work/WI-OI-121.md`, and `.pi/NOW.md` remains truthful.
- [ ] Named human Legal/License, Architecture and Security/Privacy decisions are recorded before any A1 source import.

## Discovery disposition (2026-10-08)

The pinned **candidate** is CopilotKit `v1.77.1` / `ae954754fa60561d31fffe6f2ac94889ac05f4aa`, not an approved source selection. The owner's downloaded `CopilotKit-main` archive was fully fingerprinted against later upstream commit `1e9a2af00f8638c18e36862c96a4fd4592c73c50` (22,410 matching files; no extras); the candidate package paths and lockfile are unchanged from the release. The three-package root selection resolves to 16 workspace packages/1,600 files and 78 distinct direct external dependencies, reaching 1,128 production/optional lockfile snapshot instances before pruning. Upstream in-memory thread fallback and telemetry are unacceptable as customer defaults. Root/package MIT evidence does not clear the separately restrictive `showcase/` or transitive dependencies. The architecture and threat proposal is ready for independent review, but the selected-file manifest, full SBOM/notices, A1 patch plan and human decisions remain open. No fork or UI was implemented under this card.

Owner clarified the end state: CopilotKit becomes the self-maintained GigaLibs Assistant product **inside** the repository after A1 approval. The plan was corrected so A3 establishes the optional product, metadata contribution, tenant configuration, RBAC and persistence before A4 live business data; A5 is advanced customization and billing. This is a documentation decision only, not A1 authorization.

Latest discovery check traced the immediate workspace dependencies of the 16-package candidate closure. `react-core`, `runtime` and `shared` pull in Inspector/MCP/channel/license-verifier paths that need a reviewed pruning strategy; no directory-level import list is approved. Status remains **Review**.

Further source review narrows the first v2 candidate to `react-core` + `runtime`: `react-core` already contains the v2 chat/sidebar/popup, while `react-ui`'s v2 entry is stylesheet-only. The unmodified two-root closure is still 15 workspace packages/1,506 files/72 direct external names and is **not** an import set. A `publicApiKey` without `runtimeUrl` can select CopilotKit Cloud in the upstream provider, so the fork must remove that fallback rather than rely on configuration. The exact pruned file/hash list, SBOM and notices require changing/building an isolated copy of upstream source, which this approved read-only card expressly forbids. The next proposal is A0b in a disposable non-product checkout; A1/A2 remain unapproved.

The bounded A0b proposal is [WI-OI-121a](WI-OI-121a.md), **Proposed** only. It has not been started or owner-approved.

Subsequent status (2026-10-09): WI-OI-121a is approved and running in a disposable source copy; WI-OI-121b is approved but entry-gated. The owner approved the development-preview source boundary that may retain inventoried dormant Core Inspector/Intelligence and the original Chat license warning only behind executable SSE-only, same-origin and no-vendor-egress restrictions. Historical discovery wording above describes its 2026-10-08 snapshot, not the current authorization. Independent Legal/Architecture/Security decisions and final source/dependency evidence remain open; no product import or UI mount has occurred.

## Stop and ask if

- The selected source includes restrictive or unclear licenses, an Intelligence dependency, or a vendor license/renewal path incompatible with the owner's no-CopilotKit-traffic requirement.
- A separate repository, commercial relationship, new secret owner, direct module-table access, or change to the active R5 build slot is proposed.
- Any step would change a running service, database, secret, owner data, or another agent's work.

## Report

At most five short bullets: source decision, architecture decision, evidence, blockers/risks, and the next approval.
