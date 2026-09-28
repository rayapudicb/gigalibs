# WI-OI-047 exit / WI-OI-046 entry Security decision request

Date: 2026-09-24  
Profile: `configuration-local-development-v1`  
Status: agent-executable Security verification complete; named human decisions pending

## Decision boundary

This packet supports two separate human decisions:

1. WI-OI-047 Security/Supply-chain disposition for the bounded Local Development foundation.
2. WI-OI-046 Security & Privacy design disposition for SP-01, SP-03, SP-05 and SP-07.

Neither decision authorizes production, cloud, customer-managed distribution, external provider use or
TP-2–TP-6. A WI-OI-047 decision does not automatically authorize WI-OI-046 G4 implementation.

## Current exact image identity

The WI-OI-042 rebuild supersedes the older image IDs listed in the original WI-OI-047 Security
pre-review. The current Security decision must use these exact images:

| Component | Exact image ID | Runtime user | Critical | High | Secret findings |
| --- | --- | --- | ---: | ---: | ---: |
| Migrations | `sha256:f59eb319beb1fbee31b63631b29f7077e538e10f11a275741d66e6d84e61ae18` | `65532:65532` | 0 | 0 | 0 |
| API | `sha256:7fee5a35ba72cd968ae6a5e967207d6a8a1f99fe1b05696938a8431d99f9d987` | `65532:65532` | 0 | 0 | 0 |
| Web | `sha256:ddec8e4cb4cb0effa8e45a7f89372e59a28fcfd67c71393315bb1652d413bd47` | `65532:65532` | 0 | 0 | 0 |

All three images declare source-state SHA-256
`7185c069c64026c17fb58ed02636b3304ab48e56711a92d150f0969034517fc5`, Git revision
`5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` and the Local Development profile.

## Agent-executable verification result

| Security check | Result | Evidence/qualification |
| --- | --- | --- |
| SBOM/vulnerability/secret report integrity | Pass | All nine recorded report hashes match `supply-chain-summary.json` |
| Vulnerability policy | Pass | Zero Critical and High findings; 22/24/22 lower-severity occurrences remain visible |
| Image secret scan | Pass with scanner limitation | Zero Trivy findings on every current exact image; not proof against every possible credential pattern |
| Runtime identity | Pass | All images run as `65532:65532` |
| Image environment | Pass | Only `PATH`, `SSL_CERT_FILE`, `NODE_ENV` and web `NEXT_TELEMETRY_DISABLED` are baked into image configuration |
| Exact-image filesystem policy | Pass | Current images contain no `.env*`, `.git`, `.pem`, `.key`, `id_rsa`, shell or global npm path matched by the approved policy |
| Tenant/authentication evidence | Pass for bounded F2 | Unauthenticated denial, two-tenant isolation, maker/checker denial, live revocation and logout revocation pass |
| Generated identity cleanup | Pass | Certification identities are inactive and disposable runtime resources were removed |
| SBOM license coverage | Incomplete | Missing license fields: 5/52 migrations, 27/243 API and 20/304 web components |
| Versioned SAST/IaC evidence | Not evidenced | Container scanning must not be represented as SAST or IaC scanning |
| Registry signing/provenance | Deferred | Local images only; no remote registry signature or external provenance attestation |

Authoritative current-image evidence:

- `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/supply-chain-summary.json`;
- `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/sbom/`;
- `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/vulnerability/`;
- `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/secrets/`; and
- `docs/audits/2026-09-24-wi-oi-042-replacement-evidence/runtime.json`.

## Mandatory open conditions

The Security reviewer must not silently waive these conditions:

1. An earlier deleted image contained nonempty ACS/Twilio settings. A credential owner must prove the
   affected values were rotated or revoked before any external provider use. Do not record credential
   values in repository evidence.
2. Quarantined `data-import-export-react` runtime use and the frozen CMMS Redis fallback remain routed
   findings. They are not changed or accepted here.
3. Repository-wide Analytics and frozen CMMS build/test failures remain routed release blockers.
4. Missing SBOM license fields require a later named license/legal disposition before distribution claims.
5. Versioned SAST and IaC evidence remains absent.
6. Remote registry provenance/signing, public TLS/DNS and cloud controls are `DEFERRED_EXTERNAL`.

These conditions permit a reviewer to consider bounded local continuation. They do not support a
production-ready, distribution-ready, externally connected or zero-risk claim.

## WI-OI-046 design controls to decide

The Security & Privacy reviewer must accept, condition or reject all four controls:

- **SP-01:** require current active tenant, user and membership, endpoint permission, and a durable enabled,
  in-window `tenant-access` entitlement. Missing, disabled, future and expired states use the same
  sanitized denial.
- **SP-03:** privileged preview requires both stated permissions, remains tenant-bound, creates a
  sanitized administrative-read audit event, and never becomes normal cohort membership or a metrics
  label.
- **SP-05:** use a strict versioned safe error envelope; failures reveal no other tenant, activation,
  entitlement, permission, role or database detail.
- **SP-07:** `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY` has no default; missing or invalid configuration
  prevents startup/readiness; only Local Development Compose is in TP-1 scope.

These are pre-implementation decisions. Their acceptance does not claim the future implementation tests
already pass.

## Reviewer verification commands

Run from `/Users/rayapudi/dev/gigalibs`:

```text
shasum -a 256 docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md docs/reviews/WI-OI-046-specialist-technical-pre-review-2026-09-23.md docs/plans/WI-OI-046-tp1-verification-plan.md docs/reviews/WI-OI-046-g3-decision-request-2026-09-23.md

jq '{profile,sourceStateSha256,policy,images}' docs/audits/2026-09-24-wi-oi-042-replacement-evidence/supply-chain-summary.json

jq '{status,outcomes,failures,limitations}' docs/audits/2026-09-24-wi-oi-042-replacement-evidence/runtime.json

sed -n '14,66p' docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md
```

Expected design-document hashes:

- SP-01–SP-07 request: `f6ec2b7f874783882f85ddcf8030117c7619ce472d95c9e2ca5098add837a023`;
- specialist pre-review: `1fde26c87fe8ae254d2fb9cc54b4ee1f3c973f7086abffd09daa8fcf5601b1ce`;
- TP-1 verification plan: `de491921008efe15b17cd89fffd9dad9aa4c3e321d62ce4239ad58f61a666ca8`;
- G3 decision request: `d97654eafd4c2672d2f6b4fb782c8dd65042909ae0cd86d98288a9fd3d872a65`.

## Human decision forms

### WI-OI-047 Security/Supply-chain

```text
I, [full human name], reviewed WI-OI-047 as the independent Security/Supply-chain reviewer against the
current exact images and evidence in
docs/reviews/WI-OI-047-WI-OI-046-security-decision-request-2026-09-24.md. My decision for the bounded
configuration-local-development-v1 profile is [Accept / Conditional / Reject]. Conditions/findings:
[exact text]. I do not authorize production, cloud, customer-managed distribution, external provider use
or WI-OI-046 G4 implementation. Date: [YYYY-MM-DD].
```

Given the recorded open items, an unconditional decision requires explicit evidence resolving them. A
`Conditional` local-only decision should repeat the applicable conditions instead of writing `none`.

### WI-OI-046 Security & Privacy design

```text
I, [full human name], reviewed WI-OI-046 as the independent Security & Privacy reviewer against the frozen
design evidence and the current exact-image Security evidence. My decision for SP-01, SP-03, SP-05 and
SP-07 in the bounded Local Development TP-1 slice is [Accept / Conditional / Reject]. Conditions/findings:
[exact text]. This decision does not claim TP-1 is implemented and does not authorize production, cloud,
external release or TP-2–TP-6. Date: [YYYY-MM-DD].
```

The reviewer must state their professional responsibility and whether they are independent from the
implementation producer. The credential owner supplies a separate rotation/revocation declaration; a
Security reviewer must not infer rotation from a clean image scan.
