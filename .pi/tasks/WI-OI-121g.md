# WI-OI-121g: Assistant tenant/user data boundary and grant reconciliation

- **Status:** Review (source-only private-thread checkpoint, 2026-10-10; A3 activation/acceptance open).
- **Work item:** WI-OI-121 (`.pi/WORK_ITEMS.md`); evidence in `.pi/work/WI-OI-121.md`.
- **Size:** L, executed in source-only checkpoints. This is A3 security/data foundation, not A1–A6 acceptance.

## Goal

Replace the contained Assistant's missing private-conversation foundation with an authorized, durable tenant/user-owned path. Identify and safely reconcile historical over-broad Assistant enablement and grants without deleting customer history or revoking legitimate permissions by guesswork.

## Scope

- **May change after approval:** Assistant-owned schema and **forward** migration source; Assistant Next/BFF routes, entitlement/session/permission checks and UI needed for a real private thread; focused tests; a default-dry-run exact-target grant reconciliation utility; WI-OI-121 evidence/status.
- **Must not change:** running UAT or port 5180; existing database rows, grants, messages or secrets without a separately reviewed exact-target execution decision; CMMS import/export; separately owned work; CopilotKit license/source claims; live business tools, external providers, billing or production flags.

## Read first

`.pi/NOW.md`; WI-OI-121f and evidence; Assistant plan A0b–A4; `.pi/PLAN.md` and the WI-OI-121 row; FR-07/14–16 and applicable SEC/DATA/REL/OBS/OPS NFRs; SDLC and module-completeness standards; Agile Delivery Orchestrator; ADR-0003/0018/0019; current Assistant, session, RBAC, configuration, migration and ChatChannel sources.

## Steps

1. Trace every active Assistant read/write entry and role matcher. Document the intended tenant, user, thread, entitlement and permission authority; preserve WI-OI-121f's fail-closed development-preview boundary until an accepted A3 path exists.
2. Implement module-owned private threads/messages/runs through a forward migration and owning service. Verify actor ownership on **every** direct read, stream, resume and write; never infer ownership from a client-supplied tenant/user/thread ID. Deny missing/unpublished retention policy rather than silently retaining indefinitely. No automatic migration of old `ChatChannel` records.
3. Add scoped audit/correlation, pagination and bounded content handling, explicit failure/cancel/retry semantics, and isolated two-tenant/two-user, guessed-ID, revoked-entitlement, wrong-role and restart/reload tests. Keep business tools disabled and never turn a model response into a verified business action.
4. Inventory **metadata and counts only** for historical `ChatChannel` records and Assistant feature/entitlement/grants in an identified development database. Compare to known pre-change evidence; do not attribute all wildcard grants to one script without proof. Build an idempotent, default-dry-run reconciliation proposal listing exact record IDs, before/after states, reasons, rollback snapshot and exceptions. No blanket all-tenant update or deletion.
5. Run focused tests and `pnpm verify`; record actual pass/fail/drift, compatibility, migration and recovery evidence. Request independent Security/Privacy review and the owner's exact-target data decision before any existing-data correction or UAT change.

## Done when

- [ ] Direct API and browser/BFF proofs show private thread persistence after reload/restart and deny anonymous, wrong-tenant, wrong-user, guessed-thread, revoked, unentitled and wrong-permission requests; UI hiding alone does not count.
- [ ] A forward migration, compatibility and roll-forward/recovery plan are tested in an isolated database; no legacy conversation is silently exposed, copied or erased.
- [ ] Historical grant/chat inventory and exact-target **dry run** are reviewable and reversible; no database mutation is claimed or performed under this card.
- [ ] `pnpm verify` passes or records only independently attributed drift; evidence and `.pi/NOW.md` state the remaining A0b/A1/A2, A4–A6 and human-review gates truthfully.

## Stop and ask if

- A step would change a running service, UAT, any existing database row/grant/message, credential or owner data.
- Historical ownership or retention cannot be established, a legal/privacy decision is required, or a change would overwrite another agent's work.

## Report

At most five bullets: implemented boundary, negative/round-trip proof, exact-target dry-run result, unresolved decisions, and the next A0b/A4/A5/A6 gate.

## Implementation and evidence, 2026-10-10

- Added a dormant Assistant-owned Nest API and additive migration for tenant/user-owned threads, messages, runs, audit and published-policy records. Transaction-local tenant/actor binding, forced RLS, exact `assistant:thread:read/write` checks, bounded reads/writes, idempotency and optimistic message versioning are implemented in source. The API is **not** registered in the shared module host or deployed; existing fictional preview and denied legacy history are unchanged. No policy publisher exists, so the API refuses real history without a published tenant policy.
- Disposable PostgreSQL 16 plus signed direct-port HTTP proof passed migration version, forced RLS, wrong-tenant/user/actor denial, wildcard-only and wrong-entitlement denial, missing-policy denial, revoked-session denial, retry/conflict and service restart. Six focused service tests and three read-only inventory tests passed. There is no Next/BFF/browser proof or customer-data migration.
- `scripts/assistant-grant-reconciliation.mjs` ran with `BEGIN READ ONLY`/`ROLLBACK` against the identified local **development** database for one test tenant. It reports exact entitlement/member/channel IDs and metadata/counts without message content or writes; `proposedAfter` is null because permission provenance and chat ownership are unproved. No UAT inventory or grant correction occurred. The separate pre-existing aggregate count was 21/21 Assistant-enabled tenants and 24/24 wildcard-plus-Assistant members; these are not attributable to a single script by assumption.
- `modules/gigalibs-assistant/db/README.md` records compatibility, least-privilege runtime role, roll-forward and recovery boundaries. Physical retention deletion, Configuration Studio publication, BFF/browser journey, runtime registration, grants/legacy-data decision and independent Security/Privacy review remain open. No release or production certification is claimed.
- Full `node scripts/verify.mjs` run: build, tests and all other executed audits passed; overall FAIL only at `audit:design-tokens` for separately owned `AuthAtmosphere.tsx` (6) and untracked `PlantSpatial3DViewer.tsx` (59). Deployment profile had only known `WORKFORCE_API_URL` drift; 12 isolated-DB certifications were not run without `PROOF_DATABASE_URL`. Log: `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-10T06-04-42-236Z.log`.
