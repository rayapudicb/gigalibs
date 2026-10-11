# WI-OI-121f: Assistant P0 containment, access, and local-model truth

- **Status:** Review (source containment implemented 2026-10-10; independent Security/Privacy and deployed/browser acceptance pending).
- **Work item:** WI-OI-121 (`.pi/WORK_ITEMS.md`). Evidence belongs in `.pi/work/WI-OI-121.md`.
- **Size:** L, executed as one bounded containment slice before tenant-product expansion.
- **Preparation evidence (read-only, 2026-10-10):** `ollama list` found `llama3.2:latest` (2.0 GB) and `ollama ps` showed no loaded runner. `pnpm verify --audits` passed the other executed audits but failed `audit:design-tokens` on separately owned `AuthAtmosphere.tsx` (6 classes) and untracked `PlantSpatial3DViewer.tsx` (59 classes); 12 isolated-database proofs were not run. No Assistant repair or runtime/model inference was performed.

## Goal

Stop the current Assistant from reporting invented business results, exposing same-tenant users' conversations, or bypassing module access. Make the installed local `llama3.2` path fail honestly; do not present this containment as a complete Assistant product.

## Scope

- **May change after owner approval:** Assistant Next.js routes, page/launcher and affected false-success cards; the dangerous local feature-enable script; focused tests; WI-OI-121 evidence/status. Preserve unrelated worktree changes. Use existing signed module/session and module-access primitives rather than another auth or metadata engine.
- **Must not change:** any running service or UAT at port 5180, database records/grants, migrations, model downloads, secrets/`.env*`, CMMS import/export files, other agents' work, or upstream license semantics. Do not activate a domain tool, provider, or release gate by hiding a UI control.

## Read first

`.pi/NOW.md`; this card; WI-OI-121a/b/e and evidence; Assistant plan A0b–A4; FR-07/14–16 and NFR-SEC-001/004/005/006, DATA-002/004, REL-001/002, OPS-001/002; SDLC/module-completeness standards; Agile Delivery Orchestrator; ADR-0016/0019; current session, entitlement, route, history, card, and bootstrap sources.

## Steps

1. Inventory every Assistant entry and effect. Add a server-side fail-closed development-profile, entitlement, permission, tenant, and action gate to the run/history paths and aliases; disable live domain tools until A3 and owning-module scope are accepted. Deny absent or revoked access through direct requests, not just navigation.
2. Contain the shared `ChatChannel` history: stop writing/returning a tenant-wide direct conversation as a private thread. Until module-owned, per-user thread ownership and retention are designed, deny history and do not claim durable private chat. Do not delete existing messages; report possible exposure and seek a separate data-disposition decision.
3. Remove production-reachable fabricated answers, fake tool results, success toasts, and automatic model-failure template fallback from the Assistant route and reachable cards/settings/audit pages. Unsupported operations must say unavailable; failed CMMS/model calls must show errors. Keep synthetic fixtures only behind an isolated, visibly labelled test boundary.
4. Make `scripts/enable-all-features.mjs` fail closed for broad tenant entitlement/permission mutation, especially `perms.add('*')`. Perform **read-only** impact discovery; propose a separately approved, exact-target reconciliation before any database correction. No blanket revocation script.
5. Verify the existing local Ollama `llama3.2:latest` with one synthetic, isolated streaming journey (no business data) and negative unavailable/timeout cases. The CLI/model were observed on 2026-10-10; `ollama ps` had no loaded runner. Align displayed model/endpoint with actual server policy or clearly mark settings unavailable. Do not start/stop services or pull models under this card.
6. Preserve the fork/license gate: quarantine the imported `GigalibsChatProviderProof` with its hard-coded valid license context from non-development/customer paths. Do not assert license approval, no-egress, or commercial readiness; separately route the exact source/SBOM and legal treatment for review.

## Done when

- [ ] Direct API, alias, launcher, and history tests deny anonymous, unentitled, wrong-permission, wrong-tenant/user, and production-profile requests; browser hiding alone is not counted.
- [ ] No reachable Assistant action claims a saved inspection, dispatched work order/alert, issued report, verified stock/health, or model answer without the real authorized effect and evidence. Dependency failure is visible and does not emit a fake result.
- [ ] Existing tenant-member grants are inventoried without mutation; the broad-grant script cannot silently enable all tenants or add wildcard permissions.
- [ ] Synthetic Ollama streaming and failure tests identify the exact model and artifact; no customer data is sent; unavailable model does not produce an invented answer.
- [ ] Focused tests and `pnpm verify` pass or record only independently attributed drift. Evidence, remaining fork/legal/A3–A6 gaps, and `.pi/NOW.md` are truthful. Independent Security/Privacy review remains required before release.

## Stop and ask if

- Containment requires a database write, tenant grant cleanup, migration, secret/provider change, UAT/service restart, or a legal interpretation of CopilotKit's license context.
- A fix would remove or overwrite separately owned work, or require live CMMS/customer records for proof.

## Report

At most five bullets: contained paths, security and Ollama evidence, residual data/source risks, next bounded card, and any owner decision.

## Implementation/evidence note (2026-10-10)

- The Assistant run and alias now enforce verified session, active tenant, enabled module entitlement and feature, exact `assistant:preview`, development runtime and an explicit preview flag. Only a fixed fictional pump scenario reaches local Ollama; no caller prompt, tenant/user ID, tool request or business record is accepted. The old tenant-wide history endpoint returns 410 for authorized preview users and never queries or writes `ChatChannel`.
- The active page/launcher no longer import the CopilotKit proof provider or business-result cards. Former client-only settings, tool-policy and sample-audit pages are server-routed to 404. The manifest reports `UI_PROTOTYPE` and links only the synthetic preview. The broad-grant script now exits 1 before any DB connection.
- Source proof: final 6 focused files/266 tests passed, full suite 330 files/2,807 tests passed (31 files/222 tests skipped), app typecheck, full monorepo build and post-navigation-change Next.js build passed. Local Ollama `llama3.2` returned streaming SSE for one fixed fictional prompt. `pnpm verify --audits` passes all other executed audits but fails design tokens in separately owned `AuthAtmosphere.tsx` and untracked `PlantSpatial3DViewer.tsx`; one known deployment-profile drift and 12 isolated-DB proofs remain. See `.pi/work/WI-OI-121.md`.
- A `BEGIN READ ONLY`/`ROLLBACK` aggregate query against the configured **local development** database (`127.0.0.1:5432/gigalibs_dev_runtime`) found 21/21 tenants with the Assistant feature and enabled entitlement and 24/24 members with `*`, `assistant:read`, and `assistant:action`. Counts do not prove origin and do not describe UAT. No grant or message was changed.
- Remain open: browser/Next BFF proof against a specifically provisioned test member; independent Security/Privacy review; exact-target grant and old-message disposition; finalized source/SBOM/legal treatment; A3–A6 business, tenant and billing acceptance. No UAT deployment or production claim.
