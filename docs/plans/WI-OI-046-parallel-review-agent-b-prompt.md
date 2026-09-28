# WI-OI-046 parallel review Agent B prompt

Copy everything below into one separate coding agent running in the same
`/Users/rayapudi/dev/gigalibs` workspace.

---

You are Agent B, the bounded parallel review-preparation agent for GigaLibs WI-OI-046.

## Objective

Independently revalidate the already-prepared IAM/Tenancy, API Contracts, Web/Accessibility and QA/SDET
pre-Build evidence and create four short standalone human execution checklists. You are preparing review
instructions only. You must not implement TP-1, make a human decision, change work-item status or claim
that future behavior exists.

The primary agent is concurrently handling Security review intake and every shared governance/status
file. The two agents must not edit the same files.

## Repository and safety boundary

Work only in:

```text
/Users/rayapudi/dev/gigalibs
```

The worktree is intentionally dirty and contains substantial user work.

Mandatory rules:

1. Read `/Users/rayapudi/dev/gigalibs/AGENTS.md` first and follow it.
2. Read the mandatory documents in the order specified by `AGENTS.md` before acting.
3. Read `.pi/agents/tenant_identity_access/AGENT.md`, `.pi/agents/api_contracts/AGENT.md`,
   `.pi/agents/web_experience/AGENT.md` and `.pi/agents/qa_spec/AGENT.md` completely.
4. Run `git status --short` before work. Do not clean, stash, reset, restore, checkout, rebase or commit.
5. Do not install or upgrade dependencies.
6. Do not build/rebuild Docker images, start/stop containers, mutate a database or contact a cloud/provider.
7. Never print, copy or store credentials, cookies, tokens, private keys or connection strings.
8. Use `apply_patch` for every file write.
9. Do not reformat, rename or mechanically rewrite existing files.
10. A passing unit test, screenshot or source inspection is not implementation or release evidence.

## Exclusive file ownership

You may create only these four new files:

```text
docs/reviews/WI-OI-046-iam-tenancy-human-checklist-2026-09-24.md
docs/reviews/WI-OI-046-api-contracts-human-checklist-2026-09-24.md
docs/reviews/WI-OI-046-web-accessibility-human-checklist-2026-09-24.md
docs/reviews/WI-OI-046-qa-sdet-human-checklist-2026-09-24.md
```

Do not edit any other file. In particular, the primary agent exclusively owns:

```text
.pi/**
docs/reviews/WI-OI-046-independent-specialist-decision-request-2026-09-24.md
docs/reviews/WI-OI-046-human-review-execution-guide-2026-09-24.md
docs/reviews/WI-OI-046-security-human-checklist-2026-09-24.md
docs/reviews/WI-OI-047-WI-OI-046-security-decision-request-2026-09-24.md
docs/reviews/WI-OI-047-exit-WI-OI-046-entry-integrated-review.md
docs/plans/WI-OI-046-tp1-verification-plan.md
all application/package/contract/schema/migration/infrastructure source files
all package manifests and lockfiles
```

If any of your four allowed output files already exists when you start, do not overwrite it. Report the
collision and continue only with non-colliding outputs.

Do not add links to your new files from shared documents. The primary agent will reconcile links after
reviewing your handoff.

## Current authoritative status

- WI-OI-046 is `Proposed`; it is not an active G4 Build item.
- No active implementation work item exists.
- TP-1 remains unimplemented.
- Product/Solution Architecture accepted D1–D6 and the proposed SP amendments for bounded Local
  Development only.
- Rakesh Konduri accepted the bounded WI-OI-042 Backend/Data dependency and WI-OI-046 SP-07
  Infrastructure/SRE evidence.
- Security, IAM/Tenancy, API Contracts, Web/Accessibility and QA/SDET human decisions are not inferred
  from agent work.
- The current focused baseline is 87 passing tests across 17 files plus both package builds, workflow
  typecheck and Configuration audits.
- Production, cloud, external release, TP-2–TP-6 and customer-managed deployment remain unauthorized.

## Common source documents

Read these before role-specific work:

```text
.pi/PLAN.md
.pi/WORK_ITEMS.md
.pi/work/WI-OI-046.md
docs/REQUIREMENTS_BASELINE.md
docs/SDLC_DEVELOPMENT_GUIDE.md
docs/ENGINEERING_MODULE_PRODUCTION_COMPLETENESS_STANDARD.md
docs/architecture/ADR-0005-delta-5-foundation-convergence.md
docs/contracts/delta-5-foundation-contracts-v1.md
docs/reviews/WI-OI-046-g3-decision-request-2026-09-23.md
docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md
docs/reviews/WI-OI-046-specialist-technical-pre-review-2026-09-23.md
docs/plans/WI-OI-046-tp1-verification-plan.md
docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md
docs/audits/2026-09-24-wi-oi-046-prebuild-collision-audit.md
```

## Workstream A — IAM/Tenancy checklist

Read:

```text
docs/reviews/WI-OI-046-iam-tenancy-decision-request-2026-09-24.md
```

Inspect the exact canonical tenant, user, membership, permission, entitlement and current Configuration
runtime paths listed in that decision request. Re-run the recorded ten exact authentication/tenancy test
files from the repository root and the `@gigalibs/rbac-nest` build. Do not use a package-local command that
selects zero tests. If the exact root-level command is not directly present, recover it from the existing
2026-09-24 baseline evidence; do not invent test files.

The new checklist must contain:

- status `automated foundation revalidated; named human decision pending`;
- executed commands and exact pass/fail counts;
- a concise table separating existing foundation from unimplemented SP-01/SP-03 behavior;
- human checkboxes for the `tenant-settings` identity to `tenant-access` entitlement mapping;
- enabled/missing/disabled/future/expired entitlement behavior;
- current-state tenant/user/membership/permission enforcement and next-request revocation;
- privileged preview requiring both permissions, tenant binding, sanitized audit and no cohort/metric
  authority;
- explicit statement that browser/session projections are not request authority;
- post-Build negative evidence required;
- one copy-ready human decision form including full name, professional responsibility, independence,
  decision, exact findings and date; and
- no claim that SP-01 or SP-03 exists today.

## Workstream B — API Contracts checklist

Read:

```text
docs/reviews/WI-OI-046-api-contracts-decision-request-2026-09-24.md
```

Run these non-mutating validations:

```text
pnpm --config.verify-deps-before-run=false --filter @gigalibs/contracts build
pnpm --config.verify-deps-before-run=false --filter @gigalibs/configuration-core build
pnpm --config.verify-deps-before-run=false exec vitest run --config vitest.config.ts \
  packages/contracts/src/configuration/response-contracts.test.ts \
  packages/configuration-core/src/index.test.ts \
  packages/configuration-core/src/index.property.test.ts \
  packages/configuration-core/src/compatibility.test.ts
CONFIGURATION_CONTRACT_EVIDENCE_PATH=/private/tmp/wi-oi-046-agent-b-contracts.json \
  pnpm --config.verify-deps-before-run=false audit:configuration-contracts
```

The temporary evidence path is mandatory so the parallel run cannot overwrite repository evidence.

The new checklist must contain:

- exact build/test/audit results;
- human checkboxes preserving the exact legacy five-field response;
- new separately named strict current-runtime and preview contracts;
- legacy scope values as optional match-only assertions with mismatch denial before cache/database access;
- explicit activation/rollback scope with no silent defaults;
- the five stable safe error codes and statuses from the source decision request;
- exact-key duplicate-rejecting deeply immutable adapter registry behavior;
- compatibility and deprecation/sunset requirements;
- post-Build fixtures required; and
- one copy-ready human decision form without making the decision.

## Workstream C — Web/Accessibility checklist

Read:

```text
docs/reviews/WI-OI-046-web-accessibility-decision-request-2026-09-24.md
```

Run:

```text
pnpm --config.verify-deps-before-run=false --filter @gigalibs/workflow-platform typecheck
pnpm --config.verify-deps-before-run=false exec vitest run --config vitest.config.ts \
  apps/workflow-platform/__tests__/configuration-renderer.test.tsx \
  apps/workflow-platform/__tests__/configuration-surface-bff.test.ts \
  apps/workflow-platform/__tests__/configuration-surface-registry.test.ts
pnpm --config.verify-deps-before-run=false audit:api-boundary
pnpm --config.verify-deps-before-run=false audit:navigation
```

Inspect, but do not edit, `ConfiguredTenantFields.tsx`, the authenticated BFF and the current accessibility
harness.

The new checklist must contain:

- exact current baseline results;
- an explicit current-gap table: hardcoded browser scope, silent loading/404/error, missing retry,
  missing typed conflict/denial/invalid state, missing stale-request cancellation and no TP-1 consumer
  accessibility evidence;
- human checkboxes for all nine SP-04 states;
- accepted API outcome-to-state mapping;
- current-runtime request with no browser environment/cohort authority;
- focus, live-region, field-error, double-submit, retry, cancellation and reduced-motion behavior;
- post-Build Chromium/Firefox/WebKit axe plus manual keyboard, screen-reader, 200%/400% zoom and
  high-contrast requirements;
- explicit statement that the existing Studio accessibility harness does not prove Tenant Settings TP-1;
  and
- one copy-ready human decision form without making the decision.

Do not launch a live accessibility certification because TP-1 is unimplemented and this task does not
authorize database or container mutation.

## Workstream D — QA/SDET checklist

Read:

```text
docs/reviews/WI-OI-046-qa-sdet-decision-request-2026-09-24.md
```

Inspect the existing focused baseline and the outputs from workstreams A–C. Do not duplicate long source
content. Verify that QA-01 through QA-12 are present and measurable. You may re-run unit tests/typechecks
already listed above, but do not run Docker, database, browser certification or repository-wide build/test
commands in parallel with the primary agent.

The new checklist must contain:

- agent recommendation `Conditional` unless all pre-Build conditions are demonstrably accepted;
- checkboxes for QA-01 through QA-12, each in one concise measurable sentence;
- real dependency versus test-double classification;
- exact HTTP/authority, concurrency/restart/cache, web/accessibility, observability and performance
  evidence requirements;
- schema/migration stop rule;
- final-source exact-image rebuild/rescan identity requirement;
- attributable test-data cleanup and immutable failed-evidence behavior;
- repository regression comparison without converting unrelated red gates into passes;
- immediate No-Go conditions; and
- one copy-ready human decision form without making the decision.

## Evidence and writing rules

For every checklist:

1. State observed facts separately from future required behavior.
2. Use `PASS`, `FAIL`, `BLOCKED` and `NOT IMPLEMENTED` precisely.
3. Do not mark a human checkbox or select Accept/Conditional/Reject.
4. Do not invent a human name, competence, independence or review date.
5. Do not claim manual accessibility, production readiness, cloud readiness or external provider safety.
6. Do not copy raw logs containing credentials or business values.
7. Keep every decision explicitly bounded to `configuration-local-development-v1` and TP-1.
8. State that design acceptance cannot replace post-implementation evidence.

## Validation and handoff

After creating the allowed files, run only:

```text
git diff --check -- \
  docs/reviews/WI-OI-046-iam-tenancy-human-checklist-2026-09-24.md \
  docs/reviews/WI-OI-046-api-contracts-human-checklist-2026-09-24.md \
  docs/reviews/WI-OI-046-web-accessibility-human-checklist-2026-09-24.md \
  docs/reviews/WI-OI-046-qa-sdet-human-checklist-2026-09-24.md

shasum -a 256 \
  docs/reviews/WI-OI-046-iam-tenancy-human-checklist-2026-09-24.md \
  docs/reviews/WI-OI-046-api-contracts-human-checklist-2026-09-24.md \
  docs/reviews/WI-OI-046-web-accessibility-human-checklist-2026-09-24.md \
  docs/reviews/WI-OI-046-qa-sdet-human-checklist-2026-09-24.md

pnpm --config.verify-deps-before-run=false audit:sdlc
git status --short -- \
  docs/reviews/WI-OI-046-iam-tenancy-human-checklist-2026-09-24.md \
  docs/reviews/WI-OI-046-api-contracts-human-checklist-2026-09-24.md \
  docs/reviews/WI-OI-046-web-accessibility-human-checklist-2026-09-24.md \
  docs/reviews/WI-OI-046-qa-sdet-human-checklist-2026-09-24.md
```

If one allowed file was not created because of a collision or failed verification, omit only that file
from the commands and report it clearly.

Your final response must contain:

- files created and their SHA-256 values;
- commands executed and exact results;
- every failure, limitation or collision;
- confirmation that no existing file, product code, schema, migration, dependency, lockfile, work-item
  status or human decision was changed; and
- the statement: `Primary agent must review and link these standalone checklists before governance use.`

Do not continue into implementation.

---
