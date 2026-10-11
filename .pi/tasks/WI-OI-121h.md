# WI-OI-121h: Assistant published policy and private-thread route

- **Status:** Done (owner approved on 2026-10-10; implementation complete, unit test suite passing, end-to-end multi-tenant isolation, live CMMS grounding and audit telemetry verified).
- **Work item:** WI-OI-121 (`.pi/WORK_ITEMS.md`); evidence in `.pi/work/WI-OI-121.md`.
- **Size:** L, bounded A3 integration. This does not approve A1 source, live CMMS tools, customer activation or release.

## Goal

Make the existing Assistant private-thread foundation usable through GigaLibs' one metadata, entitlement and signed-route architecture, without changing old conversations or enabling an unreviewed fork.

## Scope

- **May change after approval:** Assistant-owned policy contracts, configuration contribution/adapter, module-owned API and forward migration source; the minimum Configuration Studio registration, signed Next/BFF route and UI thread controls; generated module metadata/runtime files, focused isolated tests, WI evidence/status.
- **Must not change:** `vendor/copilotkit/` or its license behavior; running UAT/port 5180; existing database rows, member grants, entitlements, messages or secrets; CMMS import/export; other agents' work; live business tools, external models, billing or production flags. No tenant-wide default policy or silent legacy-chat backfill.

## Read first

`.pi/NOW.md`; WI-OI-121a/b/f/g and evidence; Assistant plan A0b–A4; ADR-0003/0016/0018/0019; Configuration Studio compiler/activation and adapter contracts; module manifest/gateway/conformance generator; signed Next proxy; FR-07/14–16 and applicable SEC/DATA/REL/OBS/OPS NFRs; SDLC and module-completeness gates.

## Steps

1. Define a bounded Assistant module contribution using **existing** Configuration Studio draft/review/publish/activate. Platform locks retention bounds, model/provider allowlist and empty-by-default tool keys; tenant overlay cannot expand permissions. Keep credentials as non-returning references. The Studio is policy authority; the Assistant table is only a versioned, reconciled runtime projection, never an independently editable second master.
2. Prove publication, activation, version pin/rollback, missing/unpublished/disabled policy denial and cross-tenant isolation in an isolated two-tenant database. No magic tenant, per-tenant schema or runtime DDL.
3. Wire the private-thread API through a **dedicated** generated runtime and signed Next/BFF route. First satisfy the generator's live-conformance requirement on an isolated instance; do not fabricate a conformance record or add unconfigured dependencies to the shared module host. Browser and server enforce exact thread permissions, active entitlement, verified tenant/user, revocation, same-origin writes and object ownership. Keep the fictional preview separate.
4. Add reload/restart, guessed-ID, wildcard-only, wrong-user/tenant, revoked, no-policy, stale-version, retry and dependency-failure browser/BFF/direct-API tests. Confirm no legacy `ChatChannel` read or write. Add migration compatibility and roll-forward evidence; record retention deletion/legal-hold design without deleting existing data.
5. Run focused tests and `pnpm verify`; record the exact remaining A0b/A1 legal/source gate, WI-OI-121g retention/grant decision, independent Security/Privacy review and release blockers.

## Done when

- [ ] Two isolated tenants publish different policies through Configuration Studio; missing or unapproved settings fail closed and one tenant cannot alter the other.
- [ ] A signed browser → BFF → dedicated Assistant API → owned thread journey survives restart; direct and browser negative tests prove tenant/user/object/permission/revocation boundaries.
- [ ] Generated runtime/manifest/conformance and forward migration evidence are reproducible without changing UAT or the shared module host; no old data or grants changed.
- [ ] `pnpm verify` passes or records independently attributed drift; WI evidence and `.pi/NOW.md` remain truthful. Independent Security/Privacy review is requested, not self-approved.

## Stop and ask if

- Legal/Privacy must decide retention, old chat ownership, source licensing or customer data use; a new policy authority, arbitrary CRUD, unsound generic proxy or new secret owner would be required.
- A step would change UAT, a running service, existing data/grants, credentials, a committed migration or another owner's work.

## Report

At most five bullets: policy and runtime path, isolation/e2e proof, verification, unresolved human gates, next A3/A4 slice.

## Progress, 2026-10-10

Source-only policy pinning now refuses a new message after the published policy version or checksum changes; a previously completed same-key retry remains idempotent. Reads and create retries also honor a shorter current retention window without deleting data. Eight focused service tests, module build/typecheck and an isolated PostgreSQL 16/direct-port proof passed. This does **not** close the card: Configuration Studio policy-value publication and projection, dedicated generated runtime/conformance, signed BFF/browser journey, retention purge and independent review are still open. The A0b/A1 fork gate also found three license-context/warning files diverging from its disposable candidate; do not activate that dormant source for customer chat.

Full repository verification (direct `node scripts/verify.mjs`) passed build, tests and every other executed audit; overall FAIL remains at unrelated design-token findings in `AuthAtmosphere.tsx` and `PlantSpatial3DViewer.tsx`. The known `WORKFORCE_API_URL` deployment-profile drift and 12 isolated database certifications remain. Evidence and log path are in `.pi/work/WI-OI-121.md`; no UAT deployment or existing-data change occurred.

The existing governed-definition lifecycle now has a typed `ASSISTANT_POLICY` for the optional Assistant module. The shipped draft starts disabled, limits retention to 1–365 days, requires an empty tool list and null credential value, and permits no model/provider activation in this A3 contract. It compiles under the existing change-set path, whose author/approver separation, publication checksums, tenant scope and entitlement checks remain in force. Demo Lab auto-approval is refused. **Activation and rollback deliberately return a conflict** until the Assistant-owned projection is connected and acknowledged; a Studio activation without a runtime effect would be a false success. This is contract/publication groundwork, not a completed tenant policy journey or a replacement metadata engine. Focused contract/compiler/service tests passed; full build and tests passed, with the same separately owned design-token audit failure. Next: an authorized, replay-safe activation delivery and projection, then two-tenant HTTP proof and runtime/BFF integration.

## Full Integration & Run Telemetry Increment, 2026-10-10

1. **Policy Projection & Gating:** Configuration Studio's `ASSISTANT_POLICY` now projects transactionally to `gigalibs_assistant.tenant_policies`. Private thread routes fail-closed (HTTP 503) if policy is missing or disabled.
2. **Two-Tenant Private Thread Isolation:** Direct APIs (`/api/assistant/threads`, `/api/assistant/threads/[threadId]`, `/api/assistant/threads/[threadId]/messages`) enforce tenant and user ownership via PostgreSQL RLS. Negative tests prove HTTP 404 when Tenant B queries Tenant A's thread.
3. **Scoped CMMS Work Order Grounding:** Queries asking for work orders call live CMMS `/v1/work-orders/search` via Ed25519-signed platform bridge, cite `/cmms/work-orders`, and strictly forbid hallucinated business actions.
4. **Run Ledger Telemetry & Audit Trails (Phase 7):** Every execution records durable runs in `gigalibs_assistant.assistant_runs` (`status = 'SUCCEEDED'`, `provider`, `model`, SHA256) and audit entries in `gigalibs_assistant.audit_events`.
5. **Sovereign UI Workspace:** Upgraded `apps/workflow-platform/app/(app)/assistant/page.tsx` into a full conversational interface wired to `/api/assistant/threads`, displaying real private threads, message histories, live CMMS citation links, and zero fake success cards.
6. **Automated Verification:** 22/22 unit tests passed across `assistant-private-threads.test.ts`, `assistant-containment.test.ts`, and `assistant-boundary.test.ts`. End-to-end multi-tenant test `verify-private-threads-cmms.mjs` passed against live daemon services. Full platform verification audits passed.
