# WI-OI-121a: Isolated CopilotKit v2 source-selection proof

> **Withdrawn, 2026-10-14.** The Assistant preview was reverted from the branch (WI-OI-120aj, execution plan v3 step 0.3)
> and was never deployed. GU1–GU7 in `docs/plans/gigalibs-execution-plan-v3.md` replace it. Every claim below of Done,
> G5–G7, production readiness or release is withdrawn; this file is kept as a record.

- **Status:** Replaced by GU1–GU7, steps 1.4–1.10 (plan v3 §5; step 0.6, 2026-10-15). Withdrawn 2026-10-14 (WI-OI-120aj). Was: Approved (owner, 2026-10-08: “continue next”); in progress. On 2026-10-09 the owner also approved the recommended development-preview source boundary: dormant upstream Core Inspector/Intelligence and Chat license-warning code may remain only behind an enforced SSE-only, same-origin, no-vendor-egress preview boundary. This is not legal, security or release approval. A1/A2 are separately owner-approved under WI-OI-121b but remain entry-gated.
- **Work item:** WI-OI-121 (`.pi/WORK_ITEMS.md`). Evidence goes in `.pi/work/WI-OI-121.md` and the source/boundary review.
- **Size:** M (source-selection proof only; not product implementation).

## Goal

Prove the exact CopilotKit source and dependencies GigaLibs could legally and safely import for a first self-hosted v2 chat/SSE preview, with no CopilotKit-bound runtime traffic. Produce a reviewable file manifest, patch set, SBOM and notices before proposing repository import.

## Scope

- **May change after approval:** a disposable, isolated copy of pinned CopilotKit `v1.77.1` at commit `ae954754fa60561d31fffe6f2ac94889ac05f4aa`; this card, WI-OI-121 evidence, the Assistant source/boundary review, and related status pointers. Record every source patch and generated artifact outside the product tree. Do not commit the scratch checkout.
- **Must not change:** `vendor/`, `modules/`, `packages/`, `apps/`, `pnpm-workspace.yaml`, GigaLibs lockfiles, migrations, secrets, `.env*`, running UAT/production services or databases, CMMS import/export files, another agent's work, or the web on port 5180. No customer data, model credential, hosted Intelligence key, or real business tool in the proof.

## Read first

`.pi/NOW.md`; WI-OI-121 card/evidence; `docs/plans/gigalibs-assistant-source-and-boundary-review-2026-10-08.md`; Assistant implementation plan A0–A2; ADR-0016/0019; root and nested upstream licenses; relevant SDLC/security/provenance rules.

## Steps

1. Recreate the pinned release in an isolated, least-privilege scratch location; verify the commit and compare with the already fingerprinted local archive. Exclude `showcase/` and all unrelated assets.
2. Start from `react-core/v2` chat and SSE `runtime/v2`; omit deprecated `react-ui`. Remove active cloud-key fallback, vendor telemetry, Intelligence/channels, Inspector UI, MCP/A2UI and learning paths where feasible. The approved preview boundary permits dormant upstream Core Inspector/Intelligence and the unmodified Chat license warning only if the selected runtime rejects any non-SSE/optional-feature discovery before adoption, accepts only the fixed same-origin route, and proves no vendor egress. Do not bypass a license warning/check, supply a vendor key, enable the dormant features or infer legal permission from technical dormancy.
3. Resolve the exact retained source/dependency graph and build/test it using isolated, controlled dependency installation. Inspect lifecycle scripts before allowing execution; use no repository/UAT secrets or customer data.
4. Produce selected-file paths and hashes, patch log, resolved lockfile/SBOM, license and third-party notices, asset provenance, vulnerability and endpoint/egress inventory. Run synthetic v2 UI/SSE and negative cloud-fallback/no-vendor-egress checks in the isolated proof only.
5. Record what passed, failed and remains unproved; present the exact source set for independent Legal/License, Architecture and Security/Privacy review. WI-OI-121b already conditionally authorizes A1 then A2, but neither may start before those entry-gate decisions.

## Done when

- [ ] The selected-file manifest, hashes and patch log reproduce from the pinned commit. Active excluded features are absent from the preview path; any retained dormant Core Inspector/Intelligence or Chat warning code is inventoried and denied by executable boundary/negative tests, not merely described as disabled.
- [ ] Dependency SBOM, transitive licenses/notices, assets, install scripts and vulnerability findings are recorded without claiming legal approval.
- [ ] Isolated synthetic build/tests and network-negative evidence show no CopilotKit/Segment/Scarf endpoint, including missing-runtime-URL and supplied-public-key cases.
- [ ] `pnpm verify --audits` for GigaLibs documentation passes or reports only recorded unrelated drift; no product/UAT/customer state changed.
- [ ] Evidence and `.pi/NOW.md` accurately state remaining reviewer decisions and that A1/A2 are approved but entry-gated.

## Stop and ask if

- Restrictive/unclear source, dependency or asset licenses remain unresolved at the A1 entry gate; the SSE/no-egress guard cannot be enforced; a vendor key/service is required; or a new product architecture/secret owner is proposed.
- The proof would need customer/UAT data, a GigaLibs product edit, broad network access, or an install script whose effects cannot be constrained and reviewed.

## Report

At most five short bullets: exact source result, test/SBOM result, excluded/blocked dependencies, independent decisions required, and whether the already-approved A1/A2 entry gate has passed.
