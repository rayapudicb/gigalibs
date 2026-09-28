# WI-OI-046 human review execution guide

Date: 2026-09-24  
Scope: bounded `configuration-local-development-v1` evidence and TP-1 design  
Purpose: tell each human exactly what to inspect, run and decide

## 1. What reviewers are deciding

There are two different reviews:

1. **Completed evidence review:** Backend/Data checks whether the finished WI-OI-042 Department schema
   remediation is supported by trustworthy evidence.
2. **Pre-implementation design review:** Security, IAM, SRE, API, Web and QA decide whether the proposed
   TP-1 controls and verification plan are safe and complete enough to implement. TP-1 does not exist yet,
   so these reviewers are not expected to test the future endpoint today.

Copying an approval statement without performing the applicable checks is not a review. A reviewer may
choose `Accept`, `Conditional` with exact conditions, or `Reject` with exact reasons.

Run commands from:

```text
/Users/rayapudi/dev/gigalibs
```

Do not open `.env`, print credentials, modify the live database or edit product code during review.

## 2. Common evidence check

Every reviewer should run:

```text
shasum -a 256 -c docs/reviews/WI-OI-046-g3-prebuild-candidate-manifest-2026-09-24.sha256
pnpm --config.verify-deps-before-run=false audit:sdlc
jq '{status,results,failures,limitations}' infra/compose/evidence/wi-oi-046-prebuild-20260924/focused-baseline.json
```

Expected result:

- all 15 candidate files print `OK`;
- SDLC status is `passed` with `activeImplementationWorkItems: []`;
- focused baseline status is `PASS`, every result is `PASS`, and failures are empty.

Any mismatch means stop and report `Conditional` or `Reject`; do not approve stale evidence.

## 3. Backend/Data review — completed remediation

Reviewer: a qualified database/backend engineer independent from the implementation producer.

### Run

```text
sed -n '1016,1042p' packages/db/schema.prisma
shasum -a 256 packages/db/migrations/20260920000000_canonical_departments_and_workforce_memberships/migration.sql packages/db/migrations/20260921000000_tenant_safe_department_relationships/migration.sql
jq '{status,outcomes,failures,cleanup,limitations}' docs/audits/2026-09-24-wi-oi-042-exact-migration-image-result.json
jq '{status,migrationCount,semanticChecksum,liveApplicationDatabaseModified,limitations}' docs/audits/2026-09-24-wi-oi-042-replacement-evidence/restore.json
```

### Verify

- `Department.updatedAt` is exactly
  `DateTime @default(now()) @updatedAt @db.Timestamptz(3)`.
- Migration hashes are exactly:
  - migration 36: `9d0a382397e7c3bf7e8eebac8850b9ed94c6680631d6d6daf5d5df8f9af9f727`;
  - migration 37: `09d92c59bff2d419484c3e72c26905260e549beea20f111a337c11a38ecafd5b`.
- Exact migration result is `PASS`, failures are empty and no disposable database remains.
- Outcomes include clean 37-migration replay, representative 35→37 upgrade, state preservation,
  idempotency, clean/upgraded schema equivalence and cross-tenant assignment denial.
- Restore is `PASS`, migration count is 37 and `liveApplicationDatabaseModified` is `false`.
- The reviewer agrees that WAL/PITR, off-host backup, failover and production RPO/RTO are not claimed.

Record the decision using the statement in
`docs/reviews/WI-OI-042-backend-data-decision-request-2026-09-24.md`.

## 4. Infrastructure/SRE review — TP-1 design

Reviewer: Rakesh Konduri.

### Run

```text
pnpm --config.verify-deps-before-run=false audit:configuration-deployment-profile
jq '{policy,images:[.images[]|{id,runtimeUser,critical,high,secretFindings}]}' docs/audits/2026-09-24-wi-oi-042-replacement-evidence/supply-chain-summary.json
jq '{status,outcomes,failures,limitations}' docs/audits/2026-09-24-wi-oi-042-replacement-evidence/runtime.json
jq '{status,migrationCount,semanticChecksum,liveApplicationDatabaseModified,limitations}' docs/audits/2026-09-24-wi-oi-042-replacement-evidence/restore.json
sed -n '62,70p' docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md
```

### Verify

- The selected profile is Local Development using the existing Docker/PostgreSQL/MinIO stack.
- External cloud, DNS/TLS, KMS, registry provenance, HA, alert delivery, PITR and production observation
  remain explicitly deferred.
- Exact predecessor images are non-root and the recorded Critical/High/secret policy passes.
- Runtime and clean-target restore evidence pass and state their limitations.
- SP-07 requires `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY` with no default; missing or invalid values must
  prevent startup/readiness.
- TP-1 may wire only Local Development Compose. Helm/cloud/customer-managed files remain out of scope.

Important: the runtime key is intentionally not implemented yet. Rakesh is approving or rejecting the
design requirement that the TP-1 implementation must satisfy and later prove.

If Rakesh did not perform these checks before his recorded statement, report that immediately and return
his decision to `Pending` until the review is performed.

## 5. Security and IAM/Tenancy design review

Read SP-01, SP-03, SP-05 and SP-07 in
`docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md`.

Security must also use the current exact-image evidence and explicit open-condition checklist in
`docs/reviews/WI-OI-047-WI-OI-046-security-decision-request-2026-09-24.md`. The older WI-OI-047
Security pre-review image IDs are historical after the WI-OI-042 rebuild.

Security must decide whether:

- tenant/user/membership, permission and durable `tenant-access` entitlement are all required;
- missing, disabled, future and expired entitlements return the same sanitized denial;
- the browser cannot choose tenant, environment or cohort authority;
- privileged preview requires both stated permissions, remains tenant-bound and is audited;
- stable error envelopes reveal no other tenant, role, activation, entitlement or database detail; and
- missing/invalid environment configuration fails closed without a default.

The short evidence-backed execution checklist for the Security reviewer is
`docs/reviews/WI-OI-046-security-human-checklist-2026-09-24.md`.

IAM/Tenancy must decide whether:

- `(tenant-settings, tenant-profile, profile-extension)` remains the configuration identity;
- `tenant-access` is the canonical entitlement checked for the normal journey;
- `ALL_ENTITLED_USERS_V1` is truthful only after the durable entitlement check;
- revocation is evaluated from current tenant/user/membership/entitlement state; and
- preview scope never establishes normal cohort membership.

The complete current-foundation findings, exact inspection commands and post-Build negative-test matrix
are in `docs/reviews/WI-OI-046-iam-tenancy-decision-request-2026-09-24.md`.

The concise human execution form and revalidated command set are in
`docs/reviews/WI-OI-046-iam-tenancy-human-checklist-2026-09-24.md`.

These are design decisions. The accepted implementation must later prove every item using the two-tenant,
revocation and browser-tampering tests in the TP-1 verification plan.

## 6. API Contracts design review

Read SP-01–SP-03, SP-05 and SP-06. Confirm:

- legacy `/configuration/runtime/manifest` preserves its exact strict response;
- new `/configuration/runtime/manifest/current` has a separately named strict v1 response;
- supplied legacy scope values are assertions only and mismatch is denied before cache/database access;
- preview is a separate privileged boundary;
- stable error codes use a strict safe envelope;
- adapter lookup uses an exact canonical triple; and
- duplicate descriptors fail before readiness and returned descriptors are deeply immutable.

Choose `Conditional` if deprecation/sunset behavior, error shape or compatibility fixtures require a
specific amendment before Build.

The verified current-contract findings, exact compatibility classification and required post-Build
fixtures are in `docs/reviews/WI-OI-046-api-contracts-decision-request-2026-09-24.md`.

The concise human execution form and revalidated command set are in
`docs/reviews/WI-OI-046-api-contracts-human-checklist-2026-09-24.md`.

## 7. Web/Accessibility and QA pre-Build review

Before implementation, review
`docs/plans/WI-OI-046-tp1-verification-plan.md` and SP-04.

Web/Accessibility approves or amends the required visible states:

```text
loading, absent, denied, invalid-scope, retryable-error,
ready, saving, conflict, saved
```

The planned UI must include visible retry, live announcements, predictable focus, stale-request
cancellation and no silent blank/fabricated state.

QA/SDET verifies that the plan covers:

- strict contracts and unknown-field rejection;
- duplicate adapter startup failure and deep immutability;
- missing/invalid environment startup failure;
- current, legacy-match, legacy-mismatch and preview boundaries;
- two-tenant isolation and current-state revocation;
- restart/invalidation recovery;
- complete web states and accessibility automation;
- exact-image local certification and repository gates; and
- attributable test-data cleanup.

Manual keyboard, screen-reader, 200%/400% zoom and high-contrast execution happens after TP-1 is built. The
pre-Build decision accepts or amends the plan; it does not claim those future tests already pass.

The verified current-web findings, exact state/response proposal, inspection commands and required
post-Build evidence are in
`docs/reviews/WI-OI-046-web-accessibility-decision-request-2026-09-24.md`.

The concise Web/Accessibility execution form and revalidated command set are in
`docs/reviews/WI-OI-046-web-accessibility-human-checklist-2026-09-24.md`.

The QA trace assessment, real-dependency classifications and twelve measurable amendments required for
post-Build evidence are in
`docs/reviews/WI-OI-046-qa-sdet-decision-request-2026-09-24.md`.

The concise QA/SDET execution form and cross-review gate are in
`docs/reviews/WI-OI-046-qa-sdet-human-checklist-2026-09-24.md`.

## 8. What to send back

For each responsibility, provide:

```text
Full name:
Professional responsibility:
Independent from implementation producer: Yes/No
Checks performed:
Decision: Accept / Conditional / Reject
Conditions/findings: none, or exact measurable conditions
Date:
```

The exact copy-ready decision statements remain in
`docs/reviews/WI-OI-046-independent-specialist-decision-request-2026-09-24.md`.
