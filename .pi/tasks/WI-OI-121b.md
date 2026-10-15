# WI-OI-121b: Curated CopilotKit fork and GigaLibs UI preview

> **Withdrawn, 2026-10-14.** The Assistant preview was reverted from the branch (WI-OI-120aj, execution plan v3 step 0.3)
> and was never deployed. GU1–GU7 in `docs/plans/gigalibs-execution-plan-v3.md` replace it. Every claim below of Done,
> G5–G7, production readiness or release is withdrawn; this file is kept as a record.

- **Status:** Replaced by GU1–GU7, steps 1.4–1.10 (plan v3 §5; step 0.6, 2026-10-15). Withdrawn 2026-10-14 (WI-OI-120aj). Was: Review (owner approved implementation direction on 2026-10-08; A1/A2 entry and acceptance gates remain open). Untracked source/UI appeared after approval without accepted provenance or independent review; WI-OI-121f contains the reachable UI as a development-only fictional preview.
- **Work item:** WI-OI-121 (`.pi/WORK_ITEMS.md`). Evidence: `.pi/work/WI-OI-121.md`.
- **Size:** L (bounded technical import and development-only UI; not a customer Assistant release).

## Goal

Put the legally reviewed, self-hosted CopilotKit fork **inside GigaLibs** and make its chat visible and usable through the actual signed-in GigaLibs web app. Do not present an isolated demo as this outcome or expose customer data before the Assistant's tenant/metadata/security foundation exists.

## Entry gates

1. WI-OI-121a yields a reproducible **selected** v2 chat/SSE source manifest and hashes, patch log, lockfile/SBOM/notices, vulnerability disposition, and executable SSE-only/same-origin/no-CopilotKit-egress evidence. The owner approved retaining specifically inventoried dormant Core Inspector/Intelligence and the original Chat license warning for a development preview, subject to independent review; active hosted/telemetry/channel paths, a vendor key, an unbounded handler and unresolved vulnerable dependencies still fail this gate. The earlier broad build's five high advisories have not been accepted or reassessed against the selected graph.
2. Named independent Legal/License, Architecture and Security/Privacy reviewers record decisions on that exact source set and preview boundary. The owner approves this card once; routine documentation and in-scope implementation do not need separate approvals. If a gate fails, do not silently substitute the unpruned upstream tree.
3. Resolve the discovered upstream license-warning behavior before A1: the minimal proof provider otherwise inherits a permissive license-context default, while showing the original warning exposes a clickable CopilotKit pricing link. Keep the warning and notices honest, but require a reviewed treatment that does not create vendor-bound browser traffic or bypass any applicable license condition.

## Scope

- **May change after approval and entry gates:** curated files under `vendor/copilotkit/`; the minimum GigaLibs workspace/build wiring; a development-only, authenticated Next.js Assistant preview and BFF/runtime façade in `apps/workflow-platform/`; focused tests, source notices/provenance, this card and WI-OI-121 evidence/status. Keep the UI behind an explicit development profile, separate from UAT and production navigation.
- **Must not change:** running UAT/production, port 5180, databases or migrations, secrets/`.env*`, live CMMS/customer data, tenant billing, existing role grants, CMMS import/export files, another agent's work, or unrelated modules. Do not copy `showcase/`, the whole upstream monorepo, hosted Intelligence/channels, or unclear-licensed assets. No customer-facing enablement, external action or production-reachable fake answer.

## Read first

`.pi/NOW.md`; WI-OI-121/121a evidence; Assistant implementation plan A0b–A3 and source/boundary review; `.pi/PLAN.md`; the WI-OI-121 registry row; FR-07/14/15/16 and applicable NFRs in `docs/REQUIREMENTS_BASELINE.md`; SDLC and module-completeness standards; `sdlc_orchestrator` role; ADR-0016/0019; exact source licenses, manifests and dependency findings.

## Steps

1. Complete WI-OI-121a and obtain its entry-gate reviews. Record the chosen source and non-selected files; do not move the broad proof directory into the repo.
2. **A1:** import only approved source into `vendor/copilotkit/`, retain copyright/third-party notices, pin hashes and patches, connect a reproducible locked build, and test the imported artifact. Make no live app route yet.
3. **A2:** add an authenticated, development-only GigaLibs page and same-origin façade using that fork. First exercise a visibly labeled synthetic agent with no business data; then exercise approved local and external sandbox models only when safe test endpoints/credentials exist. Show loading, streaming, cancellation, errors and retry honestly. Do not enable the route in a production build or expose it to ordinary tenant navigation.
4. Verify browser → Next route → GigaLibs façade → imported SSE runtime, and prove negative cases: anonymous/unenrolled user, route in production profile, missing runtime URL, public CopilotKit key, outbound CopilotKit/Segment/Scarf traffic, and accidental domain-data access. Preserve the A3 boundary: no live CMMS tool, tenant configuration, durable business thread or billing claim in this preview.

## Done when

- [ ] Source import exactly matches the approved manifest and notices; locked build and relevant inherited/fork tests pass.
- [ ] A signed-in developer can open the Assistant preview **inside the GigaLibs web app** and complete a synthetic streaming chat; the UI states that it is a development preview with no customer data. Browser/HTTP evidence identifies the built artifact.
- [ ] The preview is absent/denied in production and UAT profiles; server-side auth and no-vendor-egress negative tests pass. No in-memory conversation is represented as durable or tenant-safe.
- [ ] Real local and approved external sandbox-model exercises are recorded separately when credentials/endpoints are available; otherwise A2 remains partial, not Done.
- [ ] `pnpm verify` and relevant Playwright/integration checks pass or report only separately owned drift; evidence and `.pi/NOW.md` are updated. Independent reviewers sign off before any release decision.

The checked boxes previously recorded above were withdrawn on 2026-10-10 after a source review found no approved A0b file/dependency/license packet, no independent Legal/Architecture/Security acceptance, and no full browser/process no-egress proof for the actual imported bundle. The 84 imported package files match their own manifest hashes, but that self-consistency is not an approved source set or release gate. Keep the historical implementation evidence in `.pi/work/WI-OI-121.md`; do not interpret the current checkboxes as a code rollback or deletion.

## Stop and ask if

- The source/license/security entry gate cannot pass, source pruning removes required UI/SSE behavior, a provider credential or new secret owner is needed, or the implementation would require a different platform architecture.
- A step would touch UAT, production, customer data, a database, another owner's changes, or enable the preview for real tenants. A3/A4 and commercial release require separate authority.

## Report

At most five short bullets: imported source, actual GigaLibs UI evidence, negative/security evidence, remaining A3 work and any real decision required.
