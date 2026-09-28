# WI-OI-047 human review and application test guide

Status: WI-OI-047 is in Review; this guide records human decisions but does not itself prove execution

Work item: WI-OI-047 — Configuration deployment-profile contract repair

## Current evidence to review — 2026-09-23

The bounded local technical run is complete. Start with:

- `docs/audits/2026-09-23-wi-oi-047-local-technical-closure.md`;
- `infra/compose/evidence/phase-a-20260923T180053Z/phase-a-closure.json`;
- `infra/compose/evidence/phase-a-20260923T180053Z/images.json` and `gates.log`; and
- the individual runtime, outage, restore, filesystem-policy, SBOM and vulnerability-policy records in
  that replacement evidence directory. Use the earlier `phase-a-20260923T103641Z` bundle only as the
  historical pre-remediation baseline.

Record final named decisions in
`docs/reviews/WI-OI-047-exit-WI-OI-046-entry-integrated-review.md`; that packet contains the replacement
evidence hashes, source-identity interpretation, required review order and copy-ready decision form.

Use these running local endpoints only when the corresponding exact-image stack is up:

- Configuration Studio: `http://localhost:5180/studio/configuration`;
- API liveness: `http://localhost:3333/api/v1/health`;
- API readiness: `http://localhost:3333/api/v1/ready`;
- web liveness/readiness: `http://localhost:5180/api/health/live` and
  `http://localhost:5180/api/health/ready`.

The automated lifecycle already proves two-tenant isolation, maker/checker, revocation, restart, outages,
restore, performance and generated-data cleanup. Reviewers should validate those evidence records and
focus manual application time on visible workflow correctness, keyboard/screen-reader/zoom/high-contrast
behavior, sanitized errors and independent operator recovery. Do not reuse the invalid 2026-09-22 mock
screenshot as a PASS.

## 1. What “named human reviewer” means

A named reviewer is an identifiable person who:

- understands the responsibility they are accepting;
- reviews the actual linked design, source diff or test evidence;
- is not an AI agent or automated scanner;
- records their name, role, decision, date and conditions in repository evidence; and
- is sufficiently independent from the producer to challenge or reject the work.

Codex, Gemini, Claude and other agents may implement, test and prepare evidence. They cannot provide human
product, security-risk or production-release acceptance.

The code author/producer may explain and demonstrate the work but must not be the only reviewer. Automated
tests, vulnerability scanners and accessibility tools are evidence for a human decision, not reviewers.

## 2. Recommended reviewer structure

### Production-grade panel

Use separate people where practical:

| Responsibility | Suitable person |
| --- | --- |
| Product | Product owner or customer/business representative who owns the intended outcome |
| Architecture | Senior architect/engineer not solely responsible for the implementation |
| Security & Privacy | Security engineer, security consultant or qualified independent reviewer |
| Backend/Data | Engineer experienced with PostgreSQL migrations, backup/restore and failure recovery |
| Infrastructure/SRE | Person who did not author the deployment and can operate it from the runbook |
| Web/Accessibility | Accessibility-aware web reviewer; include a manual assistive-technology tester |
| QA/SDET | Independent tester who owns the negative, tenant and recovery matrix |
| Release authority | Person accountable for production rollout, halt and recovery decisions |

### Small-team minimum

For an early-stage team, compatible responsibilities may be combined, but use at least three distinct
humans:

1. Product owner/release authority — owns scope, value and rollout decision.
2. Independent technical reviewer — covers architecture, backend/data and SRE operation.
3. Independent security/QA reviewer — covers security, tenant isolation, negative tests and accessibility,
   using specialist support where they lack competence.

The implementation producer must not fill all three. A person must not accept an area they are not
qualified to evaluate. High-risk security, privacy, migration or release exceptions require an appropriate
specialist even when the general team is small.

## 3. Two different review moments

### Review A — G3 design acceptance, before implementation

Review these artifacts:

- `docs/audits/2026-09-22-configuration-f2-closure-audit.md`;
- `docs/architecture/CONFIGURATION_DEPLOYMENT_PROFILE_DESIGN.md`;
- `docs/contracts/configuration-deployment-contract-v1.md`;
- `docs/plans/configuration-deployment-acceptance-test-plan.md`; and
- `.pi/work/WI-OI-047.md`.

Reviewers decide whether the proposed repair is safe and testable. They are not claiming the application
already works.

### Review B — Local Foundation Ready review, after implementation

Reviewers inspect the actual diff, immutable images and recorded results, then independently execute or
witness the applicable application, security, failure and recovery tests in
`configuration-local-development-v1`.

G3 approval permits bounded local implementation. Passing local evidence may support the next development
slice; it does not support G5/G6 production release.

## 4. G3 design checklist

Each reviewer marks `Accept`, `Accept with conditions` or `Reject` and explains every condition/rejection.

### Product

- [ ] Accept that the current milestone verifies one Local Development Configuration Profile, not the entire platform.
- [ ] Accept that Customer-Managed production, Managed Cloud and any HostingRaja/DigitalOcean choice are deferred and unclaimed.
- [ ] Accept the existing loopback MinIO service for local evidence only.
- [ ] Accept that execution plane, CMMS, Analytics and unrelated modules are outside F2 certification.
- [ ] Accept the F2 outcome: configure, independently approve, publish and activate a Configuration surface
  and retrieve its manifest through explicit accepted scope.
- [ ] Accept that authoritative Tenant Profile value persistence is certified in F3/TP-1, not F2.

### Architecture

- [ ] API, web, migration, PostgreSQL and object-storage ownership is explicit.
- [ ] No duplicate configuration engine, tenant service or business-data gateway is introduced.
- [ ] Health semantics, cache authority and failure behavior are coherent.
- [ ] Full-platform claims are not inferred from the bounded reference profile.
- [ ] F3 can add authoritative runtime environment scope without breaking the local profile contract.

### Security and privacy

- [ ] Every secret/configuration field is classified and has one authority.
- [ ] No secrets enter images, ConfigMaps, logs, evidence or public web variables.
- [ ] Ed25519/AES key formats, rotation and retirement behavior are accepted.
- [ ] Loopback-only HTTP exceptions, local port restrictions and connector deny-by-default behavior are explicit.
- [ ] Tenant-isolation, revocation and secret-leak negative tests are sufficient.
- [ ] Object-storage authorization, encryption, retention and expiry policy is accepted.

### Backend/Data

- [ ] PostgreSQL 16 ownership and supported upgrade states are explicit.
- [ ] Migration image/command matches `packages/db` and is tied to the application release.
- [ ] Failed migration blocks rollout; no unsafe automatic down migration exists.
- [ ] Local dump/restore and semantic verification are testable; WAL/PITR/cross-host recovery is release-deferred.
- [ ] Old/new application compatibility and the single-host sequential-upgrade downtime are defined.

### Infrastructure/SRE

- [ ] Every application-required setting maps to Compose under the correct name.
- [ ] Liveness and readiness target implemented routes with correct meanings.
- [ ] Local image build, revision-qualified tag and immutable local image-ID capture are operable.
- [ ] Resource, single-process, host-failure, network and storage assumptions are explicit.
- [ ] SLO/RPO/RTO, alert, halt and operator-recovery thresholds have accountable owners.

### Web/Accessibility

- [ ] Web BFF uses `CONTROL_PLANE_API_URL`, secure cookies and bounded request bodies.
- [ ] Web liveness/readiness behavior is safe and does not expose upstream details.
- [ ] Loading, unavailable, denied, conflict, retry and success states are defined.
- [ ] Manual keyboard, screen-reader, zoom and high-contrast testing is scheduled.

### QA/SDET

- [ ] Every P0/P1 requirement maps to a test ID and evidence location.
- [ ] The local profile, two tenants, role revocation, failures, restart and recovery are covered.
- [ ] Tests use real PostgreSQL/object storage and attributable non-production data.
- [ ] Blocked infrastructure cannot be replaced by a mock pass.
- [ ] Evidence records exact source/config/image hashes and cleanup.

## 5. Application test journey after implementation

The following is the minimum human-observed F2 journey. Test tenant/user names must clearly identify them
as non-production certification data.

### A. Clean deployment

1. Begin with an empty supported host/namespace and documented prerequisites.
2. Verify the source revision, revision-qualified local image tags and immutable local image IDs.
3. Run the one-shot migration job.
4. Verify API `/api/v1/health` is live and `/api/v1/ready` is ready.
5. Verify the web liveness/readiness routes. This local profile deliberately uses loopback HTTP; public
   HTTPS certificate/hostname verification is `DEFERRED_EXTERNAL`.
6. Confirm no `.env`, credential or private key is present inside the final images or logs.

Expected: all components become Ready using only documented config/secret authorities. No repository-local
secret or manual database edit is required.

### B. Tenant and authorization setup

1. Create two isolated test tenants: A and B.
2. Create an author administrator and a distinct reviewer administrator in tenant A.
3. Create a viewer in tenant A and an administrator in tenant B.
4. Confirm unauthenticated users cannot access Configuration APIs/pages.
5. Confirm tenant B cannot enumerate tenant A identifiers or records.

Expected: the server derives tenant and current permissions from authenticated state; client identifiers
cannot override them.

### C. Configuration lifecycle

1. Author A opens Configuration Studio and selects an approved code-owned test surface.
2. Add one optional non-sensitive text field such as `industry-code` with a bounded length.
3. Validate and submit the draft.
4. Attempt self-approval as Author A; verify denial.
5. Approve as Reviewer A, publish and activate the exact checksum.
6. Retrieve the active manifest using the explicit test environment/cohort scope; do not rely on a
   `local-uat` or `all-users` default.
7. Refresh the browser and restart API/web; verify the manifest checksum remains authoritative.

Expected: maker/checker, immutable publication, exact activation, server validation, persistence, audit and
outbox behavior are visible and correct. Tenant Profile field rendering and value persistence are F3/TP-1
tests after authoritative runtime scope exists.

### D. Negative tenant and permission tests

1. As tenant B, try tenant A manifest/value IDs through URL and payload tampering.
2. As Viewer A, attempt authoring, activation and value update.
3. Downgrade Author A to viewer while logged in and retry without restarting services.
4. Suspend the membership, user and tenant in separate tests.
5. Submit unknown fields, a stale version and an incompatible required-field change.

Expected: every attempt is denied or conflicts safely, no partial write occurs, and errors reveal no other
tenant's existence or data.

### E. Signing and portability

1. Export a Configuration package using the configured Ed25519 signer.
2. Verify its key ID/signature and confirm that it contains definitions only—no record values or secrets.
3. Tamper with one byte and verify import denial.
4. Try an untrusted signer and verify denial.
5. Import a valid trusted package and verify it creates a draft only; it cannot auto-publish/activate.

### F. Process and dependency failure

1. Prime a manifest, restart the single local API process and verify authoritative resynchronization.
2. Interrupt PostgreSQL and verify readiness removal plus sanitized retryable failure.
3. Restore PostgreSQL and verify cache/outbox/invalidation convergence.
4. Interrupt object storage and verify only dependent operations become unavailable.
5. Perform the documented sequential API/web upgrade and verify old/new compatibility and truthful
   downtime.

A multi-replica/rolling-update test is required only for a future HA or Managed Cloud profile and cannot be
inferred from this local result.

### G. Backup and recovery

1. Create an accepted backup/recovery checkpoint containing the test configuration/value.
2. Restore into a clean target.
3. Verify migration history, semantic checksums, active manifest and value.
4. Record local dump/restore and restart timings against the accepted local thresholds.
5. Record WAL/PITR, independent backup and cross-host recovery as `DEFERRED_EXTERNAL`.

### H. Observability and accessibility

1. Verify unauthorized metrics access is denied and the authorized scraper succeeds.
2. Inspect the checked-in dashboard/alert definitions and authenticated live metrics. A real external
   notification fire/resolve test is `DEFERRED_EXTERNAL` for this local-only review and cannot be marked
   PASS without the missing notification tooling.
3. Follow the outage/backlog/rollback runbook as an independent operator.
4. Run automated accessibility checks in supported browsers/viewports.
5. Manually test keyboard-only operation, focus order, error announcements, screen reader, 200%/400% zoom
   and high contrast in Configuration Studio. Tenant Settings joins this matrix in F3/TP-1.

## 6. Evidence reviewers must inspect

- Exact source revision and dirty-tree disposition.
- Deployment-contract hash and rendered Compose manifest.
- API/web/migration image digests and source mapping.
- Local image IDs and available local SBOM/dependency results; remote signature/provenance is deferred.
- Migration, clean install, upgrade and restore outputs.
- Test results for every `DEP-*` ID, including blocked/failed cases.
- Tenant-negative and revocation results.
- Dashboard/alert and operator-runbook evidence.
- Accessibility automation plus signed manual test notes.
- `phase-a-20260923T180053Z/images.json`, the three SBOMs, filesystem-policy records, raw Trivy reports and
  vulnerability-policy records. Confirm that each policy binds to the recorded exact image ID and reports
  zero Critical and zero High findings with `ignoreUnfixed=false`. The automated policy is PASS after
  remediation, but named Security/Supply-chain review is still required.
- replacement `gates.log`, including every repository-wide failure and its routed owner; use the historical
  `gates-summary.json` only for the earlier focused-suite and Java-conformance evidence.
- Credential-owner evidence that the ACS/Twilio values exposed to an earlier deleted local image were
  rotated before any external use.
- Known limitations, residual risks, rollout/halt plan and recovery owner.

Screenshots may support UX evidence but do not prove authorization, persistence, isolation or recovery.

## 7. Decision record template

Copy one row per actual person. Do not use team names alone.

| Human name | Responsibility | Independent from producer? | Artifacts/evidence reviewed | Decision | Conditions or findings | Date |
| --- | --- | --- | --- | --- | --- | --- |
| _required_ | Product | Yes/No | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | Architecture | Yes/No | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | Security & Privacy | Yes/No | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | Backend/Data | Yes/No | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | Infrastructure/SRE operator | Yes/No | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | Web/Accessibility | Yes/No | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | QA/SDET | Yes/No | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |
| _required_ | Release authority | Yes/No | _links/hash_ | Accept / Conditional / Reject | _text_ | YYYY-MM-DD |

For G3, link the design artifacts. For G5/G6, link the frozen diff, release manifest and immutable evidence
bundle. Conditions remain blockers until their resolution is reviewed and recorded.

## 8. Gate rule

- G3 Go: required design reviewers accept or accept with fully resolved conditions; WI-OI-047 becomes the
  sole active Build item.
- Review entry: bounded local agent-executable evidence is complete, all non-passing results are routed,
  and no active G4 Build authority remains. WI-OI-047 currently meets this state.
- Local Foundation Accepted: all locally applicable P0/P1 conditions are resolved, every external row is
  explicitly `DEFERRED_EXTERNAL`, and the required named humans accept the exact evidence.
- G5/G6 production Go: remains unavailable until the deferred release profile, infrastructure evidence and
  Release Authority decision exist.
- Any open P0/P1, unnamed authority, fabricated result or missing real-infrastructure evidence is No-Go.
