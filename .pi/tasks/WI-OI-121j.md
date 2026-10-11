# WI-OI-121j: Assistant Staged Rollout, Observability & Production Runbook (G6/G7)

- **Status:** Done (owner approved and committed, 2026-10-11).
- **Work item:** WI-OI-121 (`.pi/WORK_ITEMS.md`); evidence in `.pi/work/WI-OI-121.md`.
- **Size:** M, bounded G6/G7 rollout controls, observability and operational runbook.

## Goal

Establish the G6/G7 staged rollout controls and operational guardrails for the sovereign GigaLibs Assistant: immutable release artifact record, controlled tenant cohort gating, runtime observability & halt criteria, and production support runbook.

## Scope

- **May change:** rollout cohort configuration and gating; health/telemetry probes; operational runbook under `docs/runbooks/`; rollout verification scripts under `apps/workflow-platform/scripts/`; task cards, evidence in `.pi/work/WI-OI-121.md` and `.pi/NOW.md`.
- **Must not change:** running UAT services, ports or databases; production credentials; existing tenant data, grants or messages; CMMS import/export files; another agent's work; external cloud providers.

## Read first

`.pi/NOW.md`; `WI-OI-121i.md` and evidence; `docs/SDLC_DEVELOPMENT_GUIDE.md`; `docs/ENGINEERING_MODULE_PRODUCTION_COMPLETENESS_STANDARD.md`; `docs/plans/gigalibs-assistant-self-hosted-implementation-plan.md`.

## Steps

1. Author the Assistant Release Manifest & Migration Record (`docs/releases/gigalibs-assistant-v1.0.0-manifest.json`) pinning artifact hashes, migration version, model dependency (`llama3.2`), and security policies.
2. Implement tenant cohort rollout gating in `apps/workflow-platform/lib/assistant-preview-access.ts` (or rollout controller), enforcing pilot cohort validation (`PILOT_INTERNAL`, `EARLY_ADOPTER_TENANTS`, `GENERAL_AVAILABILITY`) before tenant activation.
3. Establish runtime health, observability, and emergency halt criteria (circuit breaker / kill-switch when egress probe fails, local model becomes unavailable, or error threshold exceeded).
4. Author the production operations and incident response runbook (`docs/runbooks/assistant-production-operations.md`) covering provisioning, monitoring, rollback, restore drills, and halt procedures.
5. Create and run automated rollout verification script (`apps/workflow-platform/scripts/verify-assistant-rollout.mjs`) to validate cohort gating, health telemetry, and emergency halt controls.
6. Verify platform integrity (`node scripts/verify.mjs --audits`) and record evidence in `.pi/work/WI-OI-121.md`.

## Done when

- [x] Immutable release manifest and migration record created with complete component fingerprints.
- [x] Tenant cohort gating verified: non-cohort tenants are denied activation even with entitlement.
- [x] Runtime observability, health telemetry and emergency halt circuit breaker implemented and verified.
- [x] Production operations runbook authored covering deployment, incident triage, and rollback procedures.
- [x] Automated rollout verification script passes 100%.
- [x] Repository audits pass with only known pre-existing drift recorded.
- [x] Evidence recorded in `.pi/work/WI-OI-121.md` and `.pi/NOW.md` updated.

## Stop and ask if

- A step would touch production or live customer data;
- An unresolvable dependency requires external cloud provider egress;
- A deployment or migration requires changes to running UAT services outside authorized release procedures.

## Report

At most five bullets: rollout cohort controls, observability & halt criteria, production runbook, verification results, and final roadmap completion.
