# WI-OI-047 exit and WI-OI-046 entry integrated review

Date: 2026-09-24
Status: Replacement evidence reconciled; named human decisions pending

## Purpose

Allow each specialist to review the completed F2 local foundation and proposed TP-1 entry in one traceable
record without converting agent evidence into human acceptance.

## Evidence set

### WI-OI-047 local technical exit

- `docs/audits/2026-09-23-wi-oi-047-local-technical-closure.md`;
- `infra/compose/evidence/phase-a-20260923T180053Z/phase-a-closure.json`;
- `infra/compose/evidence/phase-a-20260923T180053Z/images.json`;
- `infra/compose/evidence/phase-a-20260923T180053Z/gates.log`;
- `infra/compose/evidence/phase-a-20260923T180053Z/f2-runtime.json`;
- `infra/compose/evidence/phase-a-20260923T180053Z/postgres-outage.json`;
- `infra/compose/evidence/phase-a-20260923T180053Z/minio-outage.json`;
- `infra/compose/evidence/phase-a-20260923T180053Z/restore.json`;
- `infra/compose/evidence/phase-a-20260923T180053Z/*-filesystem-policy.json`;
- `infra/compose/evidence/phase-a-20260923T180053Z/sbom/` and
  `infra/compose/evidence/phase-a-20260923T180053Z/vulnerability/`;
- `docs/audits/2026-09-24-wi-oi-047-exact-image-secret-scan-summary.json` and
  `docs/reviews/WI-OI-047-security-supply-chain-pre-review-2026-09-24.md`;
- `docs/audits/2026-09-24-wi-oi-047-backend-data-evidence-summary.json` and
  `docs/reviews/WI-OI-047-backend-data-pre-review-2026-09-24.md`;
- `docs/audits/2026-09-24-wi-oi-047-exact-migration-image-result-v4.json` and
  `docs/audits/2026-09-24-wi-oi-047-department-schema-drift.md`;
- `docs/audits/2026-09-24-wi-oi-042-exact-migration-image-result.json`,
  `docs/audits/2026-09-24-wi-oi-042-department-remediation-closure.md` and
  `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/`;
- `docs/reviews/WI-OI-042-backend-data-decision-request-2026-09-24.md`;
- `docs/reviews/WI-OI-047-human-review-guide.md`; and
- `infra/compose/backups/gigalibs_backup_20260923_180843Z.dump`.

The earlier `phase-a-20260923T103641Z` bundle is historical pre-remediation evidence only. It must not be
used to approve the replacement images.

The WI-OI-042 evidence supersedes only the Department schema-contract result and the three images rebuilt
for that bounded correction. It does not erase the original WI-OI-047 bundle or widen the Local
Development release claim.

### Replacement evidence identity

| Evidence property | Exact value |
| --- | --- |
| Image-build Git revision | `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` |
| Image-build source-state label | `3e04668a12128ac56234549152789e034a61b60b56085055d9db58b74b53f614` |
| Migrations image | `sha256:0ef0a1e9bbfc6d5294c9856c4252bf876967aac74cd5e47415c4c30246636e48` |
| API image | `sha256:0a9b4a9160dd9a840af630617bec7ec02af0b4923459b9312e6e29017a26b3ac` |
| Web image | `sha256:8541a74ac83305ae2f155a08a9a924fc9aab2118c670454331671d7e95c47301` |
| `phase-a-closure.json` SHA-256 | `cdb5a7e106456c16aee8c84da603140325af20bd9db5c2ba2d53d167e77ac842` |
| `images.json` SHA-256 | `32a0fc0e735fa78ff51be4352cc948db1cdfb8e4c81c779ae569a999c18a1405` |
| `gates.log` SHA-256 | `c851d2c25c13a32a033c57e21f5785d0090a96a5e191c9f8e48f644b63afccfa` |
| Backup SHA-256 | `92d2715f5cfdcd9f3232374328632381c84e2cb6c84d961694df408a2d23a801` |

### Superseding Department-remediation identity

| Evidence property | Exact value |
| --- | --- |
| Image-build Git revision | `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` |
| Image-build source-state label | `7185c069c64026c17fb58ed02636b3304ab48e56711a92d150f0969034517fc5` |
| Migrations image | `sha256:f59eb319beb1fbee31b63631b29f7077e538e10f11a275741d66e6d84e61ae18` |
| API image | `sha256:7fee5a35ba72cd968ae6a5e967207d6a8a1f99fe1b05696938a8431d99f9d987` |
| Web image | `sha256:ddec8e4cb4cb0effa8e45a7f89372e59a28fcfd67c71393315bb1652d413bd47` |
| Exact migration result | `docs/audits/2026-09-24-wi-oi-042-exact-migration-image-result.json` |
| Runtime/restore/supply-chain evidence | `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/` |

The raw Trivy records bind all three image IDs to the image-build revision and source-state label above.
The `sourceStateSha256` field in `phase-a-closure.json` is
`91c64a8f1d8fc5cbd07c3c7c4ad1c60b552a38ffde4b4a611241d8d39a7f56b8`; the certification script computed
that value at closure after it had written certification/evidence changes. It is therefore a closure-time
working-tree fingerprint, not the image-build fingerprint. Reviewers must use the image labels and
`images.json` for source-to-image identity. This naming ambiguity is an evidence-tooling finding for a
future authorized certification-script change; it does not justify rewriting the immutable evidence
bundle or rebuilding the already identified images.

### Automated technical disposition

- Migrations, API and web vulnerability policies: `PASS`, each with zero Critical and zero High findings
  under Trivy 0.74.0 and `ignoreUnfixed=false`.
- Filesystem policies: `PASS`; prohibited paths absent, shell absent and global npm excluded.
- F2 runtime: `PASS`, all 13 outcomes and generated-data cleanup.
- Performance: 100 reads at concurrency 10, p95 `26.791 ms`, p99 `38.235 ms`, zero failures.
- PostgreSQL and MinIO outage/recovery checks: `PASS` for the bounded local profile.
- Backup/clean-target restore: `PASS`, 37 migrations and 35 active activations preserved.
- Superseding Department certification: `PASS`; clean replay and representative upgrade match the
  canonical physical schema, applied migrations remain unchanged, and cross-tenant assignment is denied.
- Repository build/test/runtime-data audits: still failed only on the routed Analytics, frozen CMMS and
  quarantined-package conditions. They are neither WI-OI-047 passes nor authorization to edit those areas.

### WI-OI-046 proposed entry

- `docs/audits/2026-09-22-wi-oi-046-g3-readiness.md`;
- `docs/reviews/WI-OI-046-g3-decision-request-2026-09-23.md`;
- `docs/reviews/WI-OI-046-specialist-technical-pre-review-2026-09-23.md`;
- `docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md`;
- `docs/audits/2026-09-23-wi-oi-046-prebuild-collision-audit.md`;
- `docs/audits/2026-09-23-wi-oi-046-focused-prebuild-baseline.md`; and
- `docs/plans/WI-OI-046-tp1-verification-plan.md`.

## Specialist decisions

| Human responsibility | WI-OI-047 exit decision | WI-OI-046 entry decision |
| --- | --- | --- |
| Security & Privacy | Images/secrets/tenant isolation/SBOM reviewed; vulnerability and credential-rotation conditions stated | SP-01, SP-03, SP-05 and SP-07 accepted/conditioned/rejected |
| Backend/Data | Migrations, outage, restore, checksums and database authority reviewed | Advisory on entitlement query and fail-fast configuration; producer cannot self-accept |
| IAM/Tenancy | Revocation and tenant-negative evidence reviewed | SP-01 and SP-03 accepted/conditioned/rejected |
| Infrastructure/SRE | Exact-image operation, restart, outage, recovery and deferrals reviewed | SP-07 accepted/conditioned/rejected |
| API Contracts | Existing F2 contract evidence reviewed | SP-01–SP-03, SP-05 and SP-06 accepted/conditioned/rejected |
| Web/Accessibility | Automated F2 evidence plus manual keyboard/screen-reader/zoom/high-contrast result | SP-04 accepted/conditioned/rejected |
| QA/SDET | Independently reviews/witnesses F2 negative/recovery matrix and routed failures | SP-01–SP-07 verification plan accepted/conditioned/rejected |
| Product | Exact local outcome and limitations reviewed | D1–D6 and SP-01–SP-07 recommended amendments accepted; specialists not waived |

## Required review order

1. Security & Privacy validates the current exact image/SBOM/vulnerability/filesystem evidence and records
   the ACS/Twilio credential-rotation disposition. The WI-OI-042 rebuild supersedes the original
   WI-OI-047 pre-review image IDs; the current decision packet is
   `docs/reviews/WI-OI-047-WI-OI-046-security-decision-request-2026-09-24.md`. It records zero current-image
   Critical/High/secret findings plus the remaining license/SAST/IaC/quarantine/provenance limitations. No
   external use is allowed without credential-owner proof.
2. Backend/Data validates migration authority, outage semantics, backup checksum and clean-target semantic
   restore. The superseding WI-OI-042 exact image passes clean 37-migration replay, representative
   35-to-37 upgrade, state preservation, idempotency, canonical physical-schema equivalence and tenant-safe
   relationship checks. The former `departments.updatedAt` blocker is technically resolved without editing
   an applied migration or targeting the live database. Rakesh Konduri accepted that bounded WI-OI-042
   remediation as independent Backend/Data reviewer on 2026-09-24. His statement explicitly does not
   accept WI-OI-047, so the separate WI-OI-047 Backend/Data exit row remains required.
3. Infrastructure/SRE validates exact-image operation, runbook recovery, local resource assumptions and
   every `DEFERRED_EXTERNAL` boundary.
4. Web/Accessibility completes the still-manual keyboard-only, screen-reader, 200%/400% zoom and
   high-contrast checks in Configuration Studio.
5. QA/SDET independently reviews or witnesses the tenant-negative, revocation, failure, recovery and
   routed-failure matrix.
6. Product reviews the exact bounded outcome and limitations after the specialist findings are visible.
7. The SDLC Orchestrator reconciles conditions. It may move WI-OI-047 only when the recorded gate rule is
   met; it must not infer any missing decision.

WI-OI-046 entry review follows this sequence. A WI-OI-047 exit decision does not automatically accept
WI-OI-046 SP-01–SP-07 or activate G4.

## Human record

One person may add multiple responsibility rows only where organizational policy allows and competence is
documented. The producer cannot be the only reviewer for security, tenancy, migrations, recovery or
release-related risk.

| Human name | Responsibility | Independent from producer? | WI-OI-047 decision | WI-OI-046/SP decision | Evidence identity reviewed | Conditions/findings | Date |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chinni babu Rayapudo | Product Owner / Solution Architecture / Local Operator | Independent from agent producer; does not replace independent specialists | Accept with stated conditions | D1–D6 and SP-01–SP-07 amendments Accept | Replacement bundle `phase-a-20260923T180053Z`; WI-OI-046 G3 packet, specialist pre-review and amendment request | Independent Security, Backend/Data, Web/Accessibility and QA/SDET decisions remain required; ACS/Twilio rotation required before external use; no production, cloud, external release or WI-OI-046 G4 authority | 2026-09-24 |
| _required_ | Security & Privacy | Yes/No | Accept / Conditional / Reject | Accept / Conditional / Reject | _hash/link_ | _text_ | YYYY-MM-DD |
| _required_ | Backend/Data | Yes/No | Accept / Conditional / Reject | Advisory / N/A | _hash/link_ | _text_ | YYYY-MM-DD |
| _required_ | IAM/Tenancy | Yes/No | Advisory / N/A | Accept / Conditional / Reject | _hash/link_ | _text_ | YYYY-MM-DD |
| Rakesh Konduri | Infrastructure/SRE | Yes — did not implement the remediation and personally declared independence | Operational evidence accepted for TP-1 dependency; no separate WI-OI-047 acceptance inferred | Accept — SP-07 and bounded Local Development operational evidence | Frozen evidence identity plus executed checklist in `docs/reviews/WI-OI-046-infrastructure-sre-check-record-2026-09-24.md` | No conditions; no production, cloud, external release or TP-2–TP-6 authority | 2026-09-24 |
| _required_ | API Contracts | Yes/No | Advisory / N/A | Accept / Conditional / Reject | _hash/link_ | _text_ | YYYY-MM-DD |
| _required_ | Web/Accessibility | Yes/No | Accept / Conditional / Reject | Accept / Conditional / Reject | _hash/link_ | _text_ | YYYY-MM-DD |
| _required_ | QA/SDET | Yes/No | Accept / Conditional / Reject | Accept / Conditional / Reject | _hash/link_ | _text_ | YYYY-MM-DD |

### Recorded Product/Architecture/Local Operator decision — 2026-09-24

The following decision was supplied directly by Chinni babu Rayapudo and is recorded verbatim:

```text
I, Chinni babu Rayapudo, reviewed WI-OI-047 as Product Owner, Solution Architecture reviewer and Local Operator against replacement evidence bundle phase-a-20260923T180053Z. I accept it for the bounded configuration-local-development-v1 profile, subject to independent Security, Backend/Data, Web/Accessibility and QA/SDET decisions and ACS/Twilio credential rotation before external use. This does not authorize production, cloud, external release or WI-OI-046 G4 implementation. Date: 2026-09-24.
```

Disposition: Product, Solution Architecture and Local Operator review is recorded. The statement is
conditional and does not satisfy or waive any independent specialist row.

### Recorded bounded WI-OI-042 Backend/Data dependency decision — 2026-09-24

Rakesh Konduri accepted the bounded `configuration-local-development-v1` Department schema-contract
remediation as the independent Backend/Data reviewer with no conditions. The exact declaration is in
`docs/reviews/WI-OI-042-backend-data-decision-2026-09-24.md`. It resolves the routed Department mismatch
dependency only; the declaration explicitly withholds WI-OI-047 acceptance, so the Backend/Data row in
the Human record above remains open.

## Outcome rule

- WI-OI-047 stays in Review until its applicable independent rows and conditions are resolved.
- A reviewer records an actual name, competence/responsibility, evidence identity, decision, conditions
  and date. An automated PASS or agent recommendation is not a human decision.
- WI-OI-046 stays Proposed until SP-01–SP-07 and every applicable entry decision are accepted.
- No human table row is inferred from a test, agent recommendation or role name.
- No production/cloud release is authorized by this integrated local review.

## Copy-ready decision forms

Each actual reviewer may submit one statement in this form; replace every bracketed field and do not
remove applicable conditions:

```text
I, [full human name], reviewed WI-OI-047 as [responsibility] against the replacement evidence bundle
phase-a-20260923T180053Z, including exact image IDs, SBOM/vulnerability/filesystem policies, runtime,
outage, restore and routed repository-gate results applicable to my responsibility. My decision is
[Accept / Conditional / Reject]. I am [independent / not independent] from the implementation producer.
Conditions/findings: [none or exact conditions]. This decision applies only to
configuration-local-development-v1 and does not authorize production, cloud or external release.
Date: [YYYY-MM-DD].
```

The credential owner uses this separate factual record; do not include secret values:

```text
I, [full human name], confirm that I control the affected ACS/Twilio credentials and that they were
rotated/revoked on [YYYY-MM-DD]. I verified that the superseded values cannot authenticate. No credential
value is included in this record. Evidence reference: [provider audit/event identifier or protected
record].
```
