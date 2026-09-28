# WI-OI-046 Security human checklist

Date: 2026-09-24  
Profile: `configuration-local-development-v1`  
Status: automated evidence revalidated; named human decision pending

## Purpose

This is the short execution record for the next human gate. It supports two separate decisions:

1. WI-OI-047 bounded Local Development Security/Supply-chain disposition; and
2. WI-OI-046 Security & Privacy design disposition for SP-01, SP-03, SP-05 and SP-07.

The human reviewer must provide their own name, professional responsibility, independence statement and
decision. This checklist does not make either decision and does not authorize implementation or release.

## Automated evidence revalidated

| Check | Observed result | Human review action |
| --- | --- | --- |
| Frozen design hashes | All four hashes match the Security decision request | Confirm the reviewed documents are the intended design |
| Supply-chain report identity | All nine SBOM, vulnerability and secret-report SHA-256 values match `supply-chain-summary.json` | Confirm evidence integrity is sufficient for bounded local use |
| Exact images | Migrations `f59e…e61a`, API `7fee…d987`, web `ddec…bd47` | Confirm these, not deleted predecessor images, are being decided |
| Runtime user | All three images use `65532:65532` | Confirm non-root policy acceptance |
| Vulnerability policy | Critical `0`, High `0`; lower-severity occurrences remain 22/24/22 | Do not interpret as zero risk |
| Image secret reports | Zero findings in all three Trivy reports | Accept only with the documented scanner limitation |
| Runtime evidence | PASS; 13 bounded outcomes; failures empty | Confirm it is F2/local evidence and does not prove TP-1 |
| Test cleanup | Generated certification identities are inactive | Confirm cleanup evidence is adequate for local certification |

Exact source-state identity:
`7185c069c64026c17fb58ed02636b3304ab48e56711a92d150f0969034517fc5`.

### Primary-agent revalidation record

On 2026-09-24 the primary agent reran the four frozen-design hash checks and inspected the replacement
supply-chain and runtime evidence. All four design hashes and all nine SBOM, vulnerability and secret
report hashes match their recorded identities. The three vulnerability reports contain zero Critical and
zero High findings, and the three image secret reports contain zero findings. Missing SBOM license fields
remain `5/52` for migrations, `27/243` for API and `20/304` for web. No credential-owner declaration
proving rotation or revocation of the earlier ACS/Twilio values was found in repository evidence.

Accordingly, the agent recommendation remains `Conditional` for the WI-OI-047 bounded local
Security/Supply-chain disposition. The WI-OI-046 SP-01/SP-03/SP-05/SP-07 disposition remains a separate
named-human design decision. Neither conclusion changes work-item status or authorizes G4.

## Conditions the reviewer must keep visible

Mark each item `Acknowledged`, `Amend` or `Reject`:

- [ ] Earlier ACS/Twilio values must be rotated or revoked by their credential owner before any external
      provider use. Clean images do not prove rotation.
- [ ] Quarantined `data-import-export-react` runtime use and the frozen CMMS Redis fallback remain routed;
      this review does not accept them.
- [ ] Repository-wide Analytics and frozen CMMS build/test failures remain release blockers outside this
      bounded local decision.
- [ ] Missing SBOM license fields remain subject to named license/legal disposition before distribution.
- [ ] Versioned SAST and IaC evidence is absent and cannot be inferred from image scanning.
- [ ] Remote registry provenance/signing, public DNS/TLS, external secrets/KMS and cloud controls remain
      `DEFERRED_EXTERNAL`.

These limitations can coexist with a bounded local-only decision if the human reviewer explicitly keeps
them as external/distribution release stops. They cannot support a production-ready or externally
connected claim.

## WI-OI-046 design controls to decide

Mark each item `Accept`, `Amend` or `Reject`:

- [ ] **SP-01:** normal runtime requires current active tenant, user and membership, endpoint permission,
      and an enabled in-window durable `tenant-access` entitlement. Missing/disabled/future/expired states
      return the same sanitized denial.
- [ ] **SP-03:** privileged preview requires both permissions, stays tenant-bound, emits a sanitized
      administrative-read audit event, and never establishes cohort membership or a metrics label.
- [ ] **SP-05:** strict versioned error responses expose no other tenant, activation, entitlement,
      permission, role, adapter inventory, credential or database detail.
- [ ] **SP-07:** `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY` has no default; missing/invalid input prevents
      startup/readiness; TP-1 wires only Local Development Compose.

Acceptance is design acceptance only. The authorized implementation must later pass the negative,
two-tenant, revocation, safe-error, audit, startup and exact-image tests in the QA contract.

## Commands the human can run

From `/Users/rayapudi/dev/gigalibs`:

```text
shasum -a 256 \
  docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md \
  docs/reviews/WI-OI-046-specialist-technical-pre-review-2026-09-23.md \
  docs/plans/WI-OI-046-tp1-verification-plan.md \
  docs/reviews/WI-OI-046-g3-decision-request-2026-09-23.md

jq '{profile,sourceStateSha256,policy,images}' \
  docs/audits/2026-09-24-wi-oi-042-replacement-evidence/supply-chain-summary.json

jq '{status,outcomes,failures,limitations}' \
  docs/audits/2026-09-24-wi-oi-042-replacement-evidence/runtime.json

sed -n '14,66p' docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md
```

Expected design hashes and full exact-image details are recorded in
`docs/reviews/WI-OI-047-WI-OI-046-security-decision-request-2026-09-24.md`.

## Human decision forms

The two decisions are intentionally separate. The reviewer may make either or both only if qualified for
that responsibility.

### A. WI-OI-047 bounded local Security/Supply-chain

```text
I, [full human name], reviewed WI-OI-047 as the independent Security/Supply-chain reviewer against the
current exact images and evidence in
docs/reviews/WI-OI-047-WI-OI-046-security-decision-request-2026-09-24.md and completed
docs/reviews/WI-OI-046-security-human-checklist-2026-09-24.md. My decision for the bounded
configuration-local-development-v1 profile is [Accept / Conditional / Reject]. I am
[independent / not independent] from the implementation producer. Conditions/findings: [exact text].
This decision does not authorize production, cloud, customer-managed distribution, external provider use
or WI-OI-046 G4 implementation. Date: [YYYY-MM-DD].
```

Given the recorded limitations, `Conditional` is the truthful agent recommendation for WI-OI-047 unless
the human reviewer supplies separate evidence resolving every applicable open item.

### B. WI-OI-046 Security & Privacy design

```text
I, [full human name], reviewed WI-OI-046 as the independent Security & Privacy reviewer against the
frozen design evidence, current exact-image Security evidence and
docs/reviews/WI-OI-046-security-human-checklist-2026-09-24.md. My decision for SP-01, SP-03, SP-05 and
SP-07 in the bounded Local Development TP-1 slice is [Accept / Conditional / Reject]. I am
[independent / not independent] from the implementation producer. Conditions/findings: [exact text].
I confirm this is a design decision and does not claim TP-1 is implemented. This does not authorize
production, cloud, external release or TP-2–TP-6. Date: [YYYY-MM-DD].
```

The credential owner supplies a separate rotation/revocation statement without secret values. A Security
reviewer must not infer rotation from the clean image reports.
